#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for command_name in git node; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

mapfile -t metadata < <(node "$project_root/scripts/prepare-jellyfin-web.mjs" --metadata)
target_version="${metadata[0]}"
target_tag="${metadata[1]}"
release_line="${metadata[2]}"
work_dir="${JELLYFIN_WEB_WORK_DIR:-${project_root}/build/jellyfin-web-${release_line}}"
source_dir="${JELLYFIN_WEB_SOURCE:-$work_dir}"

if [[ ! -d "$source_dir/.git" ]]; then
    if [[ -n "${JELLYFIN_WEB_SOURCE:-}" ]]; then
        echo "JELLYFIN_WEB_SOURCE is not a git checkout: $source_dir" >&2
        exit 1
    fi
    mkdir -p "$(dirname "$source_dir")"
    git clone --depth 1 --branch "$target_tag" \
        https://github.com/jellyfin/jellyfin-web.git "$source_dir"
fi

node "$project_root/scripts/prepare-jellyfin-web.mjs" "$source_dir"
echo "Applied small checked Programmes hooks and owned category modules; the other tabs and upstream HTML remain unchanged."

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
