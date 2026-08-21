#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
web_source="${JELLYFIN_WEB_SOURCE:-${project_root}/build/jellyfin-web-10.11.11}"

if [[ -z "${PLUGIN_RELEASE_BASE_URL:-}" ]]; then
    echo "PLUGIN_RELEASE_BASE_URL is required." >&2
    echo "Example: PLUGIN_RELEASE_BASE_URL=https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.2.0.0 $0" >&2
    exit 1
fi

chmod +x \
    "${project_root}/scripts/prepare-jellyfin-web.sh" \
    "${project_root}/scripts/build-plugin.sh" \
    "${project_root}/scripts/build-catalog.sh"

if [[ -n "${JELLYFIN_WEB_SOURCE:-}" ]]; then
    JELLYFIN_WEB_SOURCE="$web_source" "${project_root}/scripts/prepare-jellyfin-web.sh"
else
    "${project_root}/scripts/prepare-jellyfin-web.sh"
fi

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if command -v npm >/dev/null 2>&1 && [[ "$node_major" =~ ^[0-9]+$ ]] && (( node_major >= 20 )); then
    npm --prefix "$web_source" ci
    npm --prefix "$web_source" run build:production
elif command -v docker >/dev/null 2>&1; then
    docker_command=(docker)
    if ! docker info >/dev/null 2>&1; then
        docker_command=(sudo docker)
    fi

    "${docker_command[@]}" run --rm \
        --user "$(id -u):$(id -g)" \
        -e NPM_CONFIG_CACHE=/tmp/npm-cache \
        -v "${web_source}:/src" \
        -w /src \
        node:20-bookworm \
        bash -lc 'npm ci && npm run build:production'
else
    echo "Node 20/npm or Docker is required to build Jellyfin Web." >&2
    exit 1
fi

dotnet_version="$(dotnet --version 2>/dev/null || true)"
if [[ "$dotnet_version" == 9.* ]]; then
    "${project_root}/scripts/build-plugin.sh"
elif command -v docker >/dev/null 2>&1; then
    docker_command=(docker)
    if ! docker info >/dev/null 2>&1; then
        docker_command=(sudo docker)
    fi

    "${docker_command[@]}" run --rm \
        --user "$(id -u):$(id -g)" \
        -e DOTNET_CLI_HOME=/tmp/dotnet-home \
        -e NUGET_PACKAGES=/tmp/dotnet-home/.nuget/packages \
        -v "${project_root}:/src" \
        -w /src \
        mcr.microsoft.com/dotnet/sdk:9.0 \
        bash scripts/build-plugin.sh
else
    echo ".NET 9 or Docker is required to build the server plugin." >&2
    exit 1
fi

JELLYFIN_WEB_DIST="${web_source}/dist" "${project_root}/scripts/build-catalog.sh"

echo "Release repository created under: ${project_root}/artifacts/catalog"
