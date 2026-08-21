#!/usr/bin/env bash
set -euo pipefail

umask 077

for command_name in curl python3; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

base_url="${JELLYFIN_URL:-}"
if [[ -z "$base_url" ]]; then
    read -r -p "Jellyfin URL (for example http://127.0.0.1:8096): " base_url
fi
base_url="${base_url%/}"

if [[ ! "$base_url" =~ ^https?://[^[:space:]]+$ ]]; then
    echo "JELLYFIN_URL must be a valid http:// or https:// URL." >&2
    exit 1
fi

api_key="${JELLYFIN_API_KEY:-}"
if [[ -z "$api_key" ]]; then
    read -r -s -p "Jellyfin API key (input hidden): " api_key
    echo
fi

if [[ -z "$api_key" ]]; then
    echo "An API key is required. It is never written to the output bundle." >&2
    exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() {
    rm -rf -- "$tmp_dir"
    unset api_key
}
trap cleanup EXIT

curl_common=(
    --fail
    --silent
    --show-error
    --connect-timeout 10
    --max-time 120
    --header "X-Emby-Token: ${api_key}"
)

api_get() {
    local route="$1"
    local destination="$2"
    curl "${curl_common[@]}" "${base_url}${route}" --output "$destination"
}

api_get_query() {
    local route="$1"
    local destination="$2"
    shift 2
    curl "${curl_common[@]}" --get "${base_url}${route}" "$@" --output "$destination"
}

optional_get() {
    local route="$1"
    local destination="$2"
    if ! curl "${curl_common[@]}" "${base_url}${route}" --output "$destination" 2>/dev/null; then
        printf 'null\n' > "$destination"
    fi
}

optional_get_with_status() {
    local route="$1"
    local destination="$2"
    local status_destination="$3"
    local http_status

    http_status="$(curl \
        --silent \
        --show-error \
        --connect-timeout 10 \
        --max-time 120 \
        --header "X-Emby-Token: ${api_key}" \
        --output "$destination" \
        --write-out '%{http_code}' \
        "${base_url}${route}" || true)"

    if [[ ! "$http_status" =~ ^[0-9]{3}$ ]]; then
        http_status="000"
    fi
    printf '%s\n' "$http_status" > "$status_destination"

    if [[ ! -s "$destination" ]]; then
        printf 'null\n' > "$destination"
    fi
}

echo "Collecting server and plugin metadata..."
api_get "/System/Info/Public" "$tmp_dir/system-public.json"
api_get "/System/Info" "$tmp_dir/system.json"
api_get "/Plugins" "$tmp_dir/plugins.json"
optional_get "/web/package.json" "$tmp_dir/web-package.json"
api_get "/Users" "$tmp_dir/users.json"
optional_get "/LiveTv/Info" "$tmp_dir/live-tv-info.json"
optional_get "/ScheduledTasks" "$tmp_dir/scheduled-tasks.json"

xtream_plugin_id="$(python3 - "$tmp_dir/plugins.json" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    plugins = json.load(handle)

for plugin in plugins if isinstance(plugins, list) else []:
    if not isinstance(plugin, dict):
        continue
    plugin_id = str(plugin.get("Id", ""))
    if "xtream library" in str(plugin.get("Name", "")).lower() and re.fullmatch(r"[0-9a-fA-F-]{32,36}", plugin_id):
        print(plugin_id)
        break
PY
)"

if [[ -n "$xtream_plugin_id" ]]; then
    optional_get "/Plugins/${xtream_plugin_id}/Configuration" "$tmp_dir/xtream-config.json"
else
    printf 'null\n' > "$tmp_dir/xtream-config.json"
fi

# This endpoint returns category metadata only. Its response is sanitized below;
# provider errors and credentials never leave the temporary directory.
optional_get_with_status \
    "/XtreamLibrary/Categories/Live" \
    "$tmp_dir/xtream-live-categories.json" \
    "$tmp_dir/xtream-live-categories.status"

user_id="${JELLYFIN_USER_ID:-}"
if [[ -z "$user_id" ]]; then
    user_id="$(python3 - "$tmp_dir/users.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    users = json.load(handle)

eligible = [
    user for user in users
    if user.get("Id") and user.get("Policy", {}).get("EnableLiveTvAccess", True)
]
print(eligible[0]["Id"] if eligible else "")
PY
)"
fi

if [[ -z "$user_id" ]]; then
    echo "No Live TV-enabled user was found. Set JELLYFIN_USER_ID and retry." >&2
    exit 1
fi

printf '%s\n' "$user_id" > "$tmp_dir/selected-user-id.txt"

python3 - "$tmp_dir/users.json" "$tmp_dir/user-probe-input.tsv" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    users = json.load(handle)

guid = re.compile(r"^[0-9a-fA-F-]{32,36}$")
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    for index, user in enumerate(users if isinstance(users, list) else []):
        if not isinstance(user, dict):
            continue
        user_id = str(user.get("Id", ""))
        if not guid.fullmatch(user_id):
            continue
        policy = user.get("Policy") if isinstance(user.get("Policy"), dict) else {}
        live_tv = bool(policy.get("EnableLiveTvAccess", True))
        administrator = bool(policy.get("IsAdministrator", False))
        handle.write(f"{index}\t{user_id}\t{int(live_tv)}\t{int(administrator)}\n")
PY

while IFS=$'\t' read -r probe_index probe_user_id probe_live_tv probe_administrator; do
    if ! api_get_query "/LiveTv/Channels" "$tmp_dir/user-channels-${probe_index}.json" \
        --data-urlencode "UserId=${probe_user_id}" \
        --data-urlencode "StartIndex=0" \
        --data-urlencode "Limit=1" \
        --data-urlencode "AddCurrentProgram=false" \
        --data-urlencode "EnableImages=false" \
        --data-urlencode "EnableUserData=false"; then
        printf 'null\n' > "$tmp_dir/user-channels-${probe_index}.json"
    fi
done < "$tmp_dir/user-probe-input.tsv"

echo "Collecting sanitized Live TV API probes..."
api_get_query "/LiveTv/Channels" "$tmp_dir/live-tv-channels.json" \
    --data-urlencode "UserId=${user_id}" \
    --data-urlencode "StartIndex=0" \
    --data-urlencode "Limit=25" \
    --data-urlencode "AddCurrentProgram=false" \
    --data-urlencode "EnableImages=false" \
    --data-urlencode "EnableUserData=false"

api_get_query "/Items" "$tmp_dir/items-channels.json" \
    --data-urlencode "UserId=${user_id}" \
    --data-urlencode "IncludeItemTypes=LiveTvChannel" \
    --data-urlencode "Recursive=true" \
    --data-urlencode "StartIndex=0" \
    --data-urlencode "Limit=25" \
    --data-urlencode "EnableImages=false" \
    --data-urlencode "EnableUserData=false"

if ! api_get_query "/Items/Filters" "$tmp_dir/filters.json" \
    --data-urlencode "UserId=${user_id}" \
    --data-urlencode "IncludeItemTypes=LiveTvChannel"; then
    printf 'null\n' > "$tmp_dir/filters.json"
fi

if ! api_get_query "/Items/Filters2" "$tmp_dir/filters2.json" \
    --data-urlencode "UserId=${user_id}" \
    --data-urlencode "IncludeItemTypes=LiveTvChannel" \
    --data-urlencode "Recursive=true"; then
    printf 'null\n' > "$tmp_dir/filters2.json"
fi

{
    if command -v dpkg-query >/dev/null 2>&1; then
        dpkg-query -W -f='${Package}\t${Version}\n' jellyfin-server jellyfin-web 2>/dev/null || true
    fi
    if command -v rpm >/dev/null 2>&1; then
        rpm -q --qf '%{NAME}\t%{VERSION}-%{RELEASE}\n' jellyfin-server jellyfin-web 2>/dev/null || true
    fi
} > "$tmp_dir/host-packages.tsv"

printf 'unavailable\n' > "$tmp_dir/container-runtime-status.txt"
: > "$tmp_dir/container-images.txt"
for container_runtime in docker podman; do
    if ! command -v "$container_runtime" >/dev/null 2>&1; then
        continue
    fi

    if "$container_runtime" ps >/dev/null 2>&1; then
        printf '%s\n' "$container_runtime" > "$tmp_dir/container-runtime-status.txt"
        "$container_runtime" ps --format '{{.Image}}' 2>/dev/null \
            | awk 'tolower($0) ~ /jellyfin/ { print }' \
            >> "$tmp_dir/container-images.txt" || true
    fi
done
sort -u -o "$tmp_dir/container-images.txt" "$tmp_dir/container-images.txt"

output_dir="${DISCOVERY_OUTPUT_DIR:-./discovery-output}"
mkdir -p "$output_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_file="$output_dir/discovery-bundle-${timestamp}.json"

python3 - \
    "$tmp_dir/system-public.json" \
    "$tmp_dir/system.json" \
    "$tmp_dir/plugins.json" \
    "$tmp_dir/web-package.json" \
    "$tmp_dir/live-tv-channels.json" \
    "$tmp_dir/items-channels.json" \
    "$tmp_dir/filters.json" \
    "$tmp_dir/filters2.json" \
    "$tmp_dir/host-packages.tsv" \
    "$tmp_dir/users.json" \
    "$tmp_dir/user-probe-input.tsv" \
    "$tmp_dir/selected-user-id.txt" \
    "$tmp_dir/xtream-config.json" \
    "$tmp_dir/xtream-live-categories.json" \
    "$tmp_dir/xtream-live-categories.status" \
    "$tmp_dir/live-tv-info.json" \
    "$tmp_dir/scheduled-tasks.json" \
    "$tmp_dir/container-runtime-status.txt" \
    "$tmp_dir/container-images.txt" \
    "$tmp_dir" \
    "$output_file" <<'PY'
import datetime as dt
import hashlib
import json
import pathlib
import sys

(
    public_path,
    system_path,
    plugins_path,
    web_package_path,
    live_tv_path,
    items_path,
    filters_path,
    filters2_path,
    packages_path,
    users_path,
    user_probe_input_path,
    selected_user_id_path,
    xtream_config_path,
    xtream_categories_path,
    xtream_categories_status_path,
    live_tv_info_path,
    scheduled_tasks_path,
    container_runtime_status_path,
    container_images_path,
    temp_directory,
    output_path,
) = map(pathlib.Path, sys.argv[1:])


def load_json(path):
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


def pick(source, keys):
    if not isinstance(source, dict):
        return {}
    return {key: source.get(key) for key in keys if source.get(key) is not None}


CATEGORY_FIELD_NAMES = {
    "category",
    "categoryname",
    "channelgroup",
    "channelgroups",
    "group",
    "grouptitle",
}


def sanitize_channel_probe(payload):
    if not isinstance(payload, dict):
        return {"available": False}

    items = payload.get("Items")
    if not isinstance(items, list):
        items = []

    field_union = sorted({key for item in items if isinstance(item, dict) for key in item})
    candidate_fields = sorted({
        key
        for key in field_union
        if key.replace("_", "").replace("-", "").lower() in CATEGORY_FIELD_NAMES
    })

    samples = []
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        candidates = {key: item.get(key) for key in candidate_fields if item.get(key) is not None}
        samples.append({
            "Id": item.get("Id"),
            "Name": item.get("Name"),
            "Number": item.get("ChannelNumber", item.get("Number")),
            "Tags": item.get("Tags") if isinstance(item.get("Tags"), list) else None,
            "CategoryCandidates": candidates,
            "ResponseFields": sorted(item.keys()),
        })

    return {
        "available": True,
        "TotalRecordCount": payload.get("TotalRecordCount"),
        "ReturnedItemCount": len(items),
        "ResponseFields": field_union,
        "CategoryCandidateFields": candidate_fields,
        "Samples": samples,
    }


def sanitize_filters(payload):
    if not isinstance(payload, dict):
        return {"available": False}
    safe = {"available": True, "ResponseFields": sorted(payload.keys())}
    for key in ("Tags", "Genres"):
        value = payload.get(key)
        if isinstance(value, list):
            safe[key] = value[:200]
    return safe


def ci_get(source, key, default=None):
    if not isinstance(source, dict):
        return default
    wanted = key.casefold()
    for candidate, value in source.items():
        if str(candidate).casefold() == wanted:
            return value
    return default


def read_text(path, default=""):
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return default


def summarize_xtream_configuration(payload):
    if not isinstance(payload, dict):
        return {"available": False}, set()

    providers = ci_get(payload, "Providers", [])
    if not isinstance(providers, list):
        providers = []

    configured_providers = 0
    for provider in providers:
        if not isinstance(provider, dict):
            continue
        if ci_get(provider, "BaseUrl") and ci_get(provider, "Username"):
            configured_providers += 1

    selected = ci_get(payload, "SelectedLiveCategoryIds", [])
    excluded = ci_get(payload, "ExcludedLiveStreamIds", [])
    selected = selected if isinstance(selected, list) else []
    excluded = excluded if isinstance(excluded, list) else []
    selected_ids = {str(value) for value in selected}

    mode = ci_get(payload, "LiveChannelMode", "Unknown")
    if mode == 0:
        mode = "IncludeAll"
    elif mode == 1:
        mode = "Custom"
    else:
        mode = str(mode)

    return {
        "available": True,
        "EnableLiveTv": bool(ci_get(payload, "EnableLiveTv", False)),
        "EnableNativeTuner": bool(ci_get(payload, "EnableNativeTuner", False)),
        "LiveChannelMode": mode,
        "SelectedLiveCategoryCount": len(selected),
        "ExcludedLiveStreamCount": len(excluded),
        "EnableEpg": bool(ci_get(payload, "EnableEpg", False)),
        "ProviderCount": len(providers),
        "ConfiguredProviderCount": configured_providers,
    }, selected_ids


def summarize_xtream_categories(payload, status_text, selected_ids):
    try:
        http_status = int(status_text)
    except ValueError:
        http_status = 0

    categories = payload if isinstance(payload, list) else []
    category_ids = set()
    names = []
    for category in categories:
        if not isinstance(category, dict):
            continue
        category_id = ci_get(category, "CategoryId")
        if category_id is not None:
            category_ids.add(str(category_id))
        name = ci_get(category, "CategoryName")
        if not isinstance(name, str):
            continue
        name = name.strip()
        if not name:
            continue
        if "://" in name:
            name = "[redacted URL-like category name]"
        names.append(name[:200])

    return {
        "available": http_status == 200 and isinstance(payload, list),
        "HttpStatus": http_status,
        "CategoryCount": len(categories) if isinstance(payload, list) else None,
        "SampleNames": names[:20],
        "SelectedCategoryIdsMatched": len(selected_ids & category_ids),
        "SelectedCategoryIdsMissing": len(selected_ids - category_ids),
    }


def summarize_live_tv_info(payload):
    if not isinstance(payload, dict):
        return {"available": False}

    services = ci_get(payload, "Services", [])
    services = services if isinstance(services, list) else []
    safe_services = []
    for service in services:
        if not isinstance(service, dict):
            continue
        tuners = ci_get(service, "Tuners", [])
        safe_services.append({
            "Name": ci_get(service, "Name"),
            "Status": ci_get(service, "Status"),
            "Version": ci_get(service, "Version"),
            "IsVisible": ci_get(service, "IsVisible"),
            "TunerCount": len(tuners) if isinstance(tuners, list) else None,
        })

    enabled_users = ci_get(payload, "EnabledUsers", [])
    return {
        "available": True,
        "IsEnabled": bool(ci_get(payload, "IsEnabled", False)),
        "ServiceCount": len(services),
        "EnabledUserCount": len(enabled_users) if isinstance(enabled_users, list) else None,
        "Services": safe_services,
    }


def summarize_tasks(payload):
    tasks = payload if isinstance(payload, list) else []
    safe_tasks = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        searchable = " ".join(str(ci_get(task, key, "")) for key in ("Name", "Key", "Category"))
        if not any(term in searchable.casefold() for term in ("guide", "live tv", "livetv", "xtream")):
            continue
        last = ci_get(task, "LastExecutionResult", {})
        last = last if isinstance(last, dict) else {}
        safe_tasks.append({
            "Id": ci_get(task, "Id"),
            "Name": ci_get(task, "Name"),
            "Key": ci_get(task, "Key"),
            "State": ci_get(task, "State"),
            "LastExecution": {
                "Status": ci_get(last, "Status"),
                "StartTimeUtc": ci_get(last, "StartTimeUtc"),
                "EndTimeUtc": ci_get(last, "EndTimeUtc"),
            } if last else None,
        })
    return safe_tasks


def summarize_user_channel_counts(users_payload, probe_input, selected_user_id, temp_dir):
    users_by_id = {}
    for user in users_payload if isinstance(users_payload, list) else []:
        if isinstance(user, dict) and user.get("Id"):
            users_by_id[str(user["Id"])] = user

    summaries = []
    try:
        lines = probe_input.read_text(encoding="utf-8").splitlines()
    except OSError:
        lines = []

    for line in lines:
        parts = line.split("\t")
        if len(parts) != 4:
            continue
        index, user_id, live_tv_flag, administrator_flag = parts
        payload = load_json(temp_dir / f"user-channels-{index}.json")
        total = payload.get("TotalRecordCount") if isinstance(payload, dict) else None
        user_hash = hashlib.sha256(f"jellyfin-user:{user_id}".encode("utf-8")).hexdigest()[:12]
        summaries.append({
            "UserRef": user_hash,
            "SelectedForDetailedProbe": user_id == selected_user_id,
            "EnableLiveTvAccess": live_tv_flag == "1",
            "IsAdministrator": administrator_flag == "1",
            "ChannelCount": total,
        })
    return summaries


packages = {}
try:
    for line in packages_path.read_text(encoding="utf-8").splitlines():
        name, version = line.split("\t", 1)
        packages[name] = version
except (OSError, ValueError):
    pass

public_info = load_json(public_path)
system_info = load_json(system_path)
plugins = load_json(plugins_path)
web_package = load_json(web_package_path)

plugin_summaries = []
if isinstance(plugins, list):
    for plugin in plugins:
        if not isinstance(plugin, dict):
            continue
        name = str(plugin.get("Name", ""))
        if "xtream" not in name.lower():
            continue
        plugin_summaries.append(pick(plugin, ("Name", "Version", "Id", "Status")))

web_version = packages.get("jellyfin-web")
if not web_version and isinstance(web_package, dict) and web_package.get("name") == "jellyfin-web":
    web_version = web_package.get("version")

live_tv_probe = sanitize_channel_probe(load_json(live_tv_path))
items_probe = sanitize_channel_probe(load_json(items_path))
xtream_config, selected_category_ids = summarize_xtream_configuration(load_json(xtream_config_path))
xtream_category_probe = summarize_xtream_categories(
    load_json(xtream_categories_path),
    read_text(xtream_categories_status_path, "000"),
    selected_category_ids,
)
selected_user_id = read_text(selected_user_id_path)
per_user_counts = summarize_user_channel_counts(
    load_json(users_path),
    user_probe_input_path,
    selected_user_id,
    temp_directory,
)
container_images = [line for line in read_text(container_images_path).splitlines() if line]

known_counts = [entry.get("ChannelCount") for entry in per_user_counts if isinstance(entry.get("ChannelCount"), int)]
all_known_users_empty = bool(known_counts) and max(known_counts) == 0
diagnosis = []
if all_known_users_empty:
    if xtream_config.get("available"):
        if not xtream_config.get("EnableLiveTv"):
            diagnosis.append("Xtream Library Live TV is disabled.")
        if not xtream_config.get("EnableNativeTuner"):
            diagnosis.append("Xtream Library native tuner is disabled.")
        if (
            str(xtream_config.get("LiveChannelMode", "")).casefold() == "custom"
            and xtream_config.get("SelectedLiveCategoryCount") == 0
        ):
            diagnosis.append("Live channel mode is Custom with no selected categories, which intentionally returns zero channels.")
        if xtream_config.get("ConfiguredProviderCount") == 0:
            diagnosis.append("No Xtream provider has both a base URL and username configured.")
        if (
            str(xtream_config.get("LiveChannelMode", "")).casefold() == "custom"
            and xtream_config.get("SelectedLiveCategoryCount", 0) > 0
            and xtream_category_probe.get("SelectedCategoryIdsMatched") == 0
        ):
            diagnosis.append("None of the selected Live TV category IDs exists in the provider's current category list.")
    if xtream_category_probe.get("available") and xtream_category_probe.get("CategoryCount", 0) > 0 and not diagnosis:
        diagnosis.append(
            "Provider categories are reachable, but Jellyfin's Live TV channel database is empty; refresh the Xtream cache and Jellyfin guide after checking the tuner settings."
        )
    if not diagnosis:
        diagnosis.append("Jellyfin returned zero channels for every probed user; inspect the sanitized configuration and task state below.")

bundle = {
    "SchemaVersion": 2,
    "CollectedAtUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
    "Server": pick(system_info or public_info, (
        "ProductName",
        "Version",
        "OperatingSystem",
        "Architecture",
        "StartupWizardCompleted",
    )),
    "HostPackages": packages,
    "ContainerRuntime": {
        "Status": read_text(container_runtime_status_path, "unavailable"),
        "JellyfinImages": container_images,
    },
    "JellyfinWebVersion": web_version,
    "XtreamPlugins": plugin_summaries,
    "XtreamConfiguration": xtream_config,
    "XtreamCategoryProbe": xtream_category_probe,
    "LiveTvInfo": summarize_live_tv_info(load_json(live_tv_info_path)),
    "RelevantScheduledTasks": summarize_tasks(load_json(scheduled_tasks_path)),
    "PerUserChannelCounts": per_user_counts,
    "LiveTvChannelsProbe": live_tv_probe,
    "GenericItemsProbe": items_probe,
    "LegacyFiltersProbe": sanitize_filters(load_json(filters_path)),
    "Filters2Probe": sanitize_filters(load_json(filters2_path)),
    "Hints": {
        "CategoryFieldVisibleOnLiveTvDto": bool(live_tv_probe.get("CategoryCandidateFields")),
        "CategoryFieldVisibleOnGenericDto": bool(items_probe.get("CategoryCandidateFields")),
        "AnySampleHasTags": any(sample.get("Tags") for sample in live_tv_probe.get("Samples", [])),
    },
    "Diagnosis": diagnosis,
    "Redaction": {
        "ApiKeyIncluded": False,
        "ProviderUrlsIncluded": False,
        "ProviderUsernamesIncluded": False,
        "ProviderPasswordsIncluded": False,
        "StreamPathsIncluded": False,
        "MediaSourcesIncluded": False,
        "UserNamesIncluded": False,
    },
}

with output_path.open("w", encoding="utf-8") as handle:
    json.dump(bundle, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY

echo "Discovery bundle created: $output_file"
echo "It does not contain the API key, provider credentials, user names, stream paths or media sources."
