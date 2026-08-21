#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_version="10.11.11"
target_commit="35c0793ece3adbd247eab290ae1effab851f3d37"
work_dir="${JELLYFIN_WEB_WORK_DIR:-${project_root}/build/jellyfin-web-${target_version}}"
source_dir="${JELLYFIN_WEB_SOURCE:-$work_dir}"
overlay_dir="${project_root}/web/patches/jellyfin-web-${target_version}"

for command_name in git python3; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

if [[ ! -d "$source_dir/.git" ]]; then
    if [[ -n "${JELLYFIN_WEB_SOURCE:-}" ]]; then
        echo "JELLYFIN_WEB_SOURCE is not a git checkout: $source_dir" >&2
        exit 1
    fi

    mkdir -p "$(dirname "$source_dir")"
    git clone --depth 1 --branch "v${target_version}" \
        https://github.com/jellyfin/jellyfin-web.git "$source_dir"
fi

detected_version="$(python3 - "$source_dir/package.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    print(json.load(handle).get("version", ""))
PY
)"

if [[ "$detected_version" != "$target_version" ]]; then
    echo "Refusing to patch Jellyfin Web ${detected_version:-unknown}; expected ${target_version}." >&2
    exit 1
fi

detected_commit="$(git -C "$source_dir" rev-parse HEAD)"
if [[ "$detected_commit" != "$target_commit" ]]; then
    echo "Refusing Jellyfin Web commit ${detected_commit}; expected ${target_commit}." >&2
    exit 1
fi

declare -A expected_hashes=(
    ["src/controllers/livetv/livetvsuggested.js"]="989533e0a06d63605bfffa98c8d0699623a9175c"
    ["src/controllers/livetv.html"]="365c5b4415c55f50eccab101bfd483390ab90eab"
)

declare -A previous_overlay_hashes=(
    ["src/controllers/livetv/livetvsuggested.js"]="39d40ca4cad08a6af716557a499166b5da6e3b9b ad8d909879fd446bae04a3f4f0cb998f25a77087"
    ["src/controllers/livetv.html"]="88b38063bc8894b6660ca92e95b34ab23a65f1cd 1f96005b733d1e6b1c7eeb22b539a9b5a60221e6"
)

declare -A previous_overlay_only_hashes=(
    ["src/controllers/livetv/livetvcategories.scss"]="5bf9fea463da228d5e65e1fc0600de117a521bb8"
)

overlay_only_paths=(
    "src/controllers/livetv/livetvcategories.scss"
)

for relative_path in "${!expected_hashes[@]}"; do
    target_path="${source_dir}/${relative_path}"
    overlay_path="${overlay_dir}/${relative_path}"
    current_hash="$(git -C "$source_dir" hash-object "$target_path")"
    overlay_hash="$(git -C "$source_dir" hash-object "$overlay_path")"

    if [[ "$current_hash" != "${expected_hashes[$relative_path]}" \
        && " ${previous_overlay_hashes[$relative_path]} " != *" $current_hash "* \
        && "$current_hash" != "$overlay_hash" ]]; then
        echo "Refusing to overwrite modified or unexpected file: $target_path" >&2
        exit 1
    fi
done

for relative_path in "${overlay_only_paths[@]}"; do
    target_path="${source_dir}/${relative_path}"
    overlay_path="${overlay_dir}/${relative_path}"
    if [[ -e "$target_path" ]]; then
        current_hash="$(git -C "$source_dir" hash-object "$target_path")"
        overlay_hash="$(git -C "$source_dir" hash-object "$overlay_path")"
        if [[ "$current_hash" != "$overlay_hash" \
            && " ${previous_overlay_only_hashes[$relative_path]} " != *" $current_hash "* ]]; then
            echo "Refusing to overwrite modified or unexpected file: $target_path" >&2
            exit 1
        fi
    fi
done

for relative_path in "${!expected_hashes[@]}"; do
    install -m 0644 "${overlay_dir}/${relative_path}" "${source_dir}/${relative_path}"
done

for relative_path in "${overlay_only_paths[@]}"; do
    install -m 0644 "${overlay_dir}/${relative_path}" "${source_dir}/${relative_path}"
done

echo "Prepared Jellyfin Web ${target_version} source: $source_dir"
echo "Changed only the Programmes tab source; Guide, Channels, Recordings, Schedule and Series remain upstream."

if [[ "${BUILD_WEB:-0}" == "1" ]]; then
    if ! command -v npm >/dev/null 2>&1; then
        echo "npm is required when BUILD_WEB=1." >&2
        exit 1
    fi

    npm --prefix "$source_dir" ci
    npm --prefix "$source_dir" run build:production
    echo "Jellyfin Web build created under: $source_dir/dist"
else
    echo "To build now: BUILD_WEB=1 JELLYFIN_WEB_SOURCE='$source_dir' $0"
fi
