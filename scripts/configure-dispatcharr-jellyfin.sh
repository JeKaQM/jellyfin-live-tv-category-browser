#!/usr/bin/env bash
set -euo pipefail

umask 077

for command_name in curl python3; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

jellyfin_url="${JELLYFIN_URL:-http://127.0.0.1:8096}"
dispatcharr_url="${DISPATCHARR_URL:-http://127.0.0.1:9191}"
jellyfin_url="${jellyfin_url%/}"
dispatcharr_url="${dispatcharr_url%/}"

m3u_url="${DISPATCHARR_M3U_URL:-${dispatcharr_url}/output/m3u}"
epg_url="${DISPATCHARR_EPG_URL:-${dispatcharr_url}/output/epg}"
wait_seconds="${JELLYFIN_WAIT_SECONDS:-900}"

for checked_url in "$jellyfin_url" "$dispatcharr_url" "$m3u_url" "$epg_url"; do
    if [[ ! "$checked_url" =~ ^https?://[^[:space:]]+$ ]]; then
        echo "Invalid HTTP URL: $checked_url" >&2
        exit 1
    fi
done

if [[ ! "$wait_seconds" =~ ^[0-9]+$ ]] || (( wait_seconds > 3600 )); then
    echo "JELLYFIN_WAIT_SECONDS must be an integer from 0 to 3600." >&2
    exit 1
fi

api_key="${JELLYFIN_API_KEY:-}"
if [[ -z "$api_key" ]]; then
    read -r -s -p "Jellyfin API key (input hidden): " api_key
    echo
fi

if [[ -z "$api_key" ]]; then
    echo "A Jellyfin administrator API key is required." >&2
    exit 1
fi

task_tmp_dir="$(mktemp -d)"
cleanup() {
    rm -rf -- "$task_tmp_dir"
    unset api_key
}
trap cleanup EXIT

curl_auth=(
    --fail
    --silent
    --show-error
    --connect-timeout 10
    --max-time 300
    --header "X-Emby-Token: ${api_key}"
)

api_get() {
    local route="$1"
    local destination="$2"
    if ! curl "${curl_auth[@]}" "${jellyfin_url}${route}" --output "$destination"; then
        echo "Jellyfin API request failed: GET ${route}" >&2
        return 1
    fi
}

api_post_json() {
    local route="$1"
    local body_path="$2"
    local destination="$3"
    if ! curl "${curl_auth[@]}" \
        --request POST \
        --header "Content-Type: application/json" \
        --data-binary "@${body_path}" \
        "${jellyfin_url}${route}" \
        --output "$destination"; then
        echo "Jellyfin API request failed: POST ${route}" >&2
        return 1
    fi
}

echo "Checking Dispatcharr outputs..."
curl --fail --silent --show-error --head --connect-timeout 10 --max-time 30 "$epg_url" >/dev/null
curl --fail --silent --show-error --connect-timeout 10 --max-time 300 \
    "$m3u_url" --output "$task_tmp_dir/dispatcharr.m3u"

python3 - "$task_tmp_dir/dispatcharr.m3u" > "$task_tmp_dir/m3u-summary.tsv" <<'PY'
import re
import sys

channels = 0
groups = set()
unique_extinf = set()
unique_tvg_ids = set()
with open(sys.argv[1], encoding="utf-8", errors="replace") as playlist:
    for line in playlist:
        if not line.startswith("#EXTINF"):
            continue
        channels += 1
        unique_extinf.add(line.rstrip("\r\n"))
        match = re.search(r'group-title="([^"]*)"', line)
        group = match.group(1).strip() if match else ""
        groups.add(group or "Uncategorised")
        tvg_match = re.search(r'tvg-id="([^"]+)"', line)
        if tvg_match:
            unique_tvg_ids.add(tvg_match.group(1))

print(f"{channels}\t{len(groups)}\t{len(unique_extinf)}\t{len(unique_tvg_ids)}")
PY

IFS=$'\t' read -r exported_channels exported_groups unique_extinf_count unique_tvg_id_count < "$task_tmp_dir/m3u-summary.tsv"
if (( exported_channels == 0 )); then
    echo "Dispatcharr's M3U contains no configured channels." >&2
    exit 1
fi
if (( exported_groups == 0 )); then
    echo "Dispatcharr's M3U contains no channel groups." >&2
    exit 1
fi
echo "Dispatcharr exports ${exported_channels} playlist entries in ${exported_groups} groups."
if (( unique_extinf_count < exported_channels )); then
    echo "Warning: only ${unique_extinf_count} EXTINF records are unique; $(( exported_channels - unique_extinf_count )) entries are exact metadata duplicates." >&2
fi
if (( unique_tvg_id_count > 0 && unique_tvg_id_count < exported_channels )); then
    echo "Diagnostic: ${unique_tvg_id_count} unique non-empty tvg-id values were found." >&2
fi

echo "Checking Jellyfin and its current Live TV configuration..."
api_get "/System/Info" "$task_tmp_dir/system-info.json"
api_get "/System/Configuration/livetv" "$task_tmp_dir/livetv-before.json"

python3 - "$task_tmp_dir/system-info.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    info = json.load(handle)
print(f"Jellyfin {info.get('Version', 'unknown')} detected.")
PY

python3 - \
    "$task_tmp_dir/livetv-before.json" \
    "$m3u_url" \
    "$epg_url" \
    > "$task_tmp_dir/existing-state.tsv" <<'PY'
import json
import sys


def get_ci(source, key, default=None):
    if not isinstance(source, dict):
        return default
    for candidate, value in source.items():
        if str(candidate).casefold() == key.casefold():
            return value
    return default


def same_url(left, right):
    return isinstance(left, str) and left.rstrip("/") == right.rstrip("/")


with open(sys.argv[1], encoding="utf-8") as handle:
    config = json.load(handle)

m3u_url = sys.argv[2]
epg_url = sys.argv[3]
tuners = get_ci(config, "TunerHosts", []) or []
providers = get_ci(config, "ListingProviders", []) or []

tuner_exists = any(
    str(get_ci(tuner, "Type", "")).casefold() == "m3u"
    and same_url(get_ci(tuner, "Url"), m3u_url)
    for tuner in tuners
)
epg_exists = any(
    str(get_ci(provider, "Type", "")).casefold() == "xmltv"
    and same_url(get_ci(provider, "Path"), epg_url)
    for provider in providers
)

print(f"{int(tuner_exists)}\t{int(epg_exists)}")
PY

IFS=$'\t' read -r tuner_exists epg_exists < "$task_tmp_dir/existing-state.tsv"

if [[ "$tuner_exists" == "1" ]]; then
    echo "Dispatcharr M3U tuner already exists; leaving it unchanged."
else
    python3 - "$m3u_url" "$task_tmp_dir/tuner.json" <<'PY'
import json
import sys

body = {
    "Type": "m3u",
    "Url": sys.argv[1],
    "FriendlyName": "Dispatcharr",
    "ImportFavoritesOnly": False,
    "AllowHWTranscoding": True,
    "AllowFmp4TranscodingContainer": False,
    "AllowStreamSharing": True,
    "FallbackMaxStreamingBitrate": 30000000,
    "EnableStreamLooping": False,
    "TunerCount": 0,
    "UserAgent": "Jellyfin",
    "IgnoreDts": True,
    "ReadAtNativeFramerate": False,
}
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    json.dump(body, handle)
PY
    api_post_json "/LiveTv/TunerHosts" "$task_tmp_dir/tuner.json" "$task_tmp_dir/tuner-response.json"
    echo "Added Dispatcharr as Jellyfin's M3U tuner."
fi

if [[ "$epg_exists" == "1" ]]; then
    echo "Dispatcharr XMLTV guide already exists; leaving it unchanged."
else
    python3 - "$epg_url" "$task_tmp_dir/epg.json" <<'PY'
import json
import sys

body = {
    "Type": "xmltv",
    "Path": sys.argv[1],
    "EnableAllTuners": True,
    "EnabledTuners": [],
}
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    json.dump(body, handle)
PY
    api_post_json "/LiveTv/ListingProviders" "$task_tmp_dir/epg.json" "$task_tmp_dir/epg-response.json"
    echo "Added Dispatcharr as Jellyfin's XMLTV guide source."
fi

api_get "/Users" "$task_tmp_dir/users.json"
user_id="$(python3 - "$task_tmp_dir/users.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    users = json.load(handle)

eligible = []
for user in users if isinstance(users, list) else []:
    if not isinstance(user, dict) or not user.get("Id"):
        continue
    policy = user.get("Policy") if isinstance(user.get("Policy"), dict) else {}
    if not policy.get("EnableLiveTvAccess", True):
        continue
    eligible.append((not bool(policy.get("IsAdministrator", False)), str(user["Id"])))

eligible.sort()
print(eligible[0][1] if eligible else "")
PY
)"

if [[ -z "$user_id" ]]; then
    echo "No Jellyfin user with Live TV access was found." >&2
    exit 1
fi

api_get "/ScheduledTasks" "$task_tmp_dir/tasks.json"
IFS=$'\t' read -r guide_task_id guide_task_state < <(python3 - "$task_tmp_dir/tasks.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    tasks = json.load(handle)

for task in tasks if isinstance(tasks, list) else []:
    if not isinstance(task, dict):
        continue
    key = str(task.get("Key", "")).casefold()
    name = str(task.get("Name", "")).casefold()
    if key == "refreshguide" or "refresh guide" in name:
        print(f"{task.get('Id', '')}\t{task.get('State', '')}")
        break
PY
)

if [[ -n "$guide_task_id" ]]; then
    if [[ "${guide_task_state,,}" == "running" ]]; then
        echo "Jellyfin's Refresh Guide task is already running; leaving it alone."
    else
        curl "${curl_auth[@]}" \
            --request POST \
            "${jellyfin_url}/ScheduledTasks/Running/${guide_task_id}" \
            --output /dev/null
        echo "Started Jellyfin's Refresh Guide task."
    fi
else
    echo "Warning: Jellyfin's Refresh Guide task was not found; configuration was saved but refresh was not started." >&2
fi

channel_count=0
if (( wait_seconds > 0 )); then
    echo "Waiting up to ${wait_seconds} seconds for Jellyfin to publish channels..."
    started_at="$(date +%s)"
    deadline=$(( started_at + wait_seconds ))

    while (( $(date +%s) <= deadline )); do
        if curl "${curl_auth[@]}" \
            --get "${jellyfin_url}/LiveTv/Channels" \
            --data-urlencode "UserId=${user_id}" \
            --data-urlencode "StartIndex=0" \
            --data-urlencode "Limit=1" \
            --data-urlencode "AddCurrentProgram=false" \
            --data-urlencode "EnableImages=false" \
            --data-urlencode "EnableUserData=false" \
            --output "$task_tmp_dir/channel-count.json"; then
            channel_count="$(python3 - "$task_tmp_dir/channel-count.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
print(payload.get("TotalRecordCount", 0))
PY
)"
        fi

        if [[ "$channel_count" =~ ^[0-9]+$ ]] && (( channel_count > 0 )); then
            break
        fi
        sleep 10
    done
fi

if [[ "$channel_count" =~ ^[0-9]+$ ]] && (( channel_count > 0 )); then
    echo "Jellyfin now exposes ${channel_count} Live TV channels."
    if (( channel_count != exported_channels )); then
        echo "Note: Dispatcharr exports ${exported_channels}; Jellyfin currently exposes ${channel_count}. The refresh may still be finishing or Jellyfin may have merged/filtered entries."
    fi
else
    echo "Jellyfin has not exposed channels yet. The tuner and guide are configured; inspect the Refresh Guide task/log before retrying this script." >&2
    exit 2
fi

if api_get "/Plugins" "$task_tmp_dir/plugins.json"; then
    if python3 - "$task_tmp_dir/plugins.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    plugins = json.load(handle)

active = any(
    isinstance(plugin, dict)
    and "xtream library" in str(plugin.get("Name", "")).casefold()
    and str(plugin.get("Status", "")).casefold() == "active"
    for plugin in plugins if isinstance(plugins, list)
)
raise SystemExit(0 if active else 1)
PY
    then
        echo "Xtream Library is still active. Confirm Dispatcharr playback first, then disable or uninstall it so it cannot create duplicate channels later."
    fi
fi

echo "Dispatcharr-to-Jellyfin setup completed."
