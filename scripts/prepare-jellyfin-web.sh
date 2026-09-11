#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_version="12.0.0"
target_tag="v12.0"
target_commit="0e83c6a724b31f3e9b5a499244331a288c060a4a"
release_line="12.0"
work_dir="${JELLYFIN_WEB_WORK_DIR:-${project_root}/build/jellyfin-web-${release_line}}"
source_dir="${JELLYFIN_WEB_SOURCE:-$work_dir}"
overlay_dir="${project_root}/web/patches/jellyfin-web-${release_line}"

python_command="${PYTHON:-python3}"

for command_name in git "$python_command"; do
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
    git clone --depth 1 --branch "$target_tag" \
        https://github.com/jellyfin/jellyfin-web.git "$source_dir"
fi

detected_version="$("$python_command" -c \
    'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("version", ""))' \
    "$source_dir/package.json")"

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
    ["src/apps/legacy/controllers/livetv/livetvsuggested.js"]="49699fd4f2588f0be26f5f421e3ee44bddaf6f09"
    ["src/apps/legacy/controllers/livetv.html"]="365c5b4415c55f50eccab101bfd483390ab90eab"
    ["src/apps/modern/features/libraries/components/PageTabContent.tsx"]="430e09f6737f18ed1c06210a18cf62d556717922"
)

declare -A previous_overlay_hashes=(
    ["src/apps/legacy/controllers/livetv/livetvsuggested.js"]="2125c30cadc0ca6fccf6d69148fed79d3e39f019"
    ["src/apps/modern/features/libraries/components/LiveTvCategoriesView.tsx"]="f6029930b2ac876e2f55531dde3cfaedca9a0355 f3db757537e793c17b10ba162aa8ac9729a6a31d 2a98888feac2fb139fa1687413925631cb3de9f4"
)

for relative_path in "${!expected_hashes[@]}"; do
    overlay_path="${overlay_dir}/${relative_path}"
    if [[ ! -f "$overlay_path" ]]; then
        echo "Missing required overlay file: $overlay_path" >&2
        exit 1
    fi

    target_path="${source_dir}/${relative_path}"
    if [[ ! -f "$target_path" ]]; then
        echo "Expected Jellyfin Web source file is missing: $target_path" >&2
        exit 1
    fi

    current_hash="$(git -C "$source_dir" hash-object "$target_path")"
    overlay_hash="$(git -C "$source_dir" hash-object "$overlay_path")"
    previous_hashes="${previous_overlay_hashes[$relative_path]-}"

    if [[ "$current_hash" != "${expected_hashes[$relative_path]}" \
        && " $previous_hashes " != *" $current_hash "* \
        && "$current_hash" != "$overlay_hash" ]]; then
        echo "Refusing to overwrite modified or unexpected file: $target_path" >&2
        exit 1
    fi
done

while IFS= read -r -d '' overlay_path; do
    relative_path="${overlay_path#${overlay_dir}/}"
    target_path="${source_dir}/${relative_path}"
    expected_hash="${expected_hashes[$relative_path]-}"

    if [[ -z "$expected_hash" && -e "$target_path" ]]; then
        current_hash="$(git -C "$source_dir" hash-object "$target_path")"
        overlay_hash="$(git -C "$source_dir" hash-object "$overlay_path")"
        previous_hashes="${previous_overlay_hashes[$relative_path]-}"
        if [[ "$current_hash" != "$overlay_hash" \
            && " $previous_hashes " != *" $current_hash "* ]]; then
            echo "Refusing to overwrite unexpected existing file: $target_path" >&2
            exit 1
        fi
    fi

    install -D -m 0644 "$overlay_path" "$target_path"
done < <(find "$overlay_dir" -type f -print0)

echo "Prepared Jellyfin Web ${target_version} source: $source_dir"
echo "Changed the modern and TV/legacy Programmes views; Guide, Channels, Recordings, Schedule and Series remain upstream."

if [[ "${BUILD_WEB:-0}" == "1" ]]; then
    if ! command -v npm >/dev/null 2>&1; then
        echo "npm is required when BUILD_WEB=1." >&2
        exit 1
    fi

    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    npm_major="$(npm --version | cut -d. -f1)"
    if (( node_major < 24 || npm_major < 11 )); then
        echo "Jellyfin Web 12 requires Node 24+ and npm 11+; found Node $(node --version), npm $(npm --version)." >&2
        exit 1
    fi

    npm --prefix "$source_dir" ci
    npm --prefix "$source_dir" run build:production
    echo "Jellyfin Web build created under: $source_dir/dist"
else
    echo "To build now: BUILD_WEB=1 JELLYFIN_WEB_SOURCE='$source_dir' $0"
fi
