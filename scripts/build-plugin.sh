#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
configuration="${CONFIGURATION:-Release}"
output_dir="${PLUGIN_OUTPUT_DIR:-${project_root}/artifacts/plugin}"

if ! command -v dotnet >/dev/null 2>&1; then
    echo "The .NET 10 SDK is required to build this Jellyfin 12 plugin." >&2
    echo "Install dotnet-sdk-10.0, then rerun this command." >&2
    exit 1
fi

dotnet_version="$(dotnet --version)"
if [[ "$dotnet_version" != 10.* ]]; then
    echo "The .NET 10 SDK is required; found ${dotnet_version}." >&2
    exit 1
fi

dotnet test \
    "${project_root}/Jellyfin.Plugin.LiveTvCategories.Tests/Jellyfin.Plugin.LiveTvCategories.Tests.csproj" \
    --configuration "$configuration"

dotnet publish \
    "${project_root}/Jellyfin.Plugin.LiveTvCategories/Jellyfin.Plugin.LiveTvCategories.csproj" \
    --configuration "$configuration" \
    --no-self-contained \
    --output "$output_dir"

echo "Plugin build created: ${output_dir}/Jellyfin.Plugin.LiveTvCategories.dll"
