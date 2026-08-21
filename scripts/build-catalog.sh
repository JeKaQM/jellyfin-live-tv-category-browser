#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_dll="${PLUGIN_DLL_PATH:-${project_root}/artifacts/plugin/Jellyfin.Plugin.LiveTvCategories.dll}"
web_dist="${JELLYFIN_WEB_DIST:-${project_root}/build/jellyfin-web-10.11.11/dist}"
catalog_dir="${CATALOG_OUTPUT_DIR:-${project_root}/artifacts/catalog}"
release_base_url="${PLUGIN_RELEASE_BASE_URL:-}"
build_timestamp="${BUILD_TIMESTAMP:-}"
source_repository_url="${PLUGIN_SOURCE_URL:-}"

if [[ -z "$source_repository_url" \
    && "$release_base_url" =~ ^(https://github\.com/[^/]+/[^/]+)/releases/download/[^/]+$ ]]; then
    source_repository_url="${BASH_REMATCH[1]}"
fi

if [[ -z "$source_repository_url" ]]; then
    source_repository_url="unpublished local test build"
fi

if [[ -z "$release_base_url" ]]; then
    echo "PLUGIN_RELEASE_BASE_URL is required and must be the public URL containing the package ZIP." >&2
    exit 1
fi

for required_file in "$plugin_dll" "${web_dist}/index.html" "${project_root}/LICENSE" "${project_root}/NOTICE.md"; do
    if [[ ! -f "$required_file" ]]; then
        echo "Required release artifact is missing: $required_file" >&2
        exit 1
    fi
done

version="$(python3 - "${project_root}/Directory.Build.props" <<'PY'
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
value = root.findtext(".//Version")
if not value:
    raise SystemExit("Directory.Build.props does not contain Version")
print(value)
PY
)"

package_name="Jellyfin.Plugin.LiveTvCategories_${version}.zip"
package_path="${catalog_dir}/${package_name}"
staging_dir="$(mktemp -d)"
trap 'rm -rf "$staging_dir"' EXIT

install -d "${staging_dir}/web" "$catalog_dir"
install -m 0644 "$plugin_dll" "${staging_dir}/Jellyfin.Plugin.LiveTvCategories.dll"
install -m 0644 "${project_root}/LICENSE" "${staging_dir}/LICENSE"
install -m 0644 "${project_root}/NOTICE.md" "${staging_dir}/NOTICE.md"
cp -a "${web_dist}/." "${staging_dir}/web/"

python3 - "$staging_dir/SOURCE.txt" "$source_repository_url" "$version" <<'PY'
import pathlib
import sys

target = pathlib.Path(sys.argv[1])
source_url = sys.argv[2]
version = sys.argv[3]
target.write_text(
    "Live TV Categories source code\n"
    "==============================\n\n"
    f"Plugin version: {version}\n"
    f"Project source: {source_url}\n"
    "Jellyfin Web source: https://github.com/jellyfin/jellyfin-web/tree/v10.11.11\n"
    "Jellyfin Web commit: 35c0793ece3adbd247eab290ae1effab851f3d37\n\n"
    "The exact overlay and repeatable build scripts are in the project source.\n",
    encoding="utf-8")
PY

python3 - "$staging_dir" "$package_path" <<'PY'
import os
import shutil
import stat
import sys
import zipfile

source, target = sys.argv[1:]
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for root, directories, files in os.walk(source):
        directories.sort()
        files.sort()
        for filename in files:
            path = os.path.join(root, filename)
            relative_path = os.path.relpath(path, source).replace(os.sep, "/")
            info = zipfile.ZipInfo(relative_path, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            with open(path, "rb") as source_file, archive.open(info, "w") as target_file:
                shutil.copyfileobj(source_file, target_file)
PY

python3 - "$package_path" "$catalog_dir/manifest.json" "$release_base_url" "$version" "$build_timestamp" <<'PY'
import datetime
import hashlib
import json
import pathlib
import sys

package_path = pathlib.Path(sys.argv[1])
manifest_path = pathlib.Path(sys.argv[2])
base_url = sys.argv[3].rstrip("/")
version = sys.argv[4]
requested_timestamp = sys.argv[5]
checksum = hashlib.md5(package_path.read_bytes()).hexdigest().upper()
timestamp = requested_timestamp or datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()

manifest = [{
    "guid": "a4b2fdc8-cb2a-463b-812a-16e9ea88e12a",
    "name": "Live TV Categories",
    "overview": "Dynamic category-first browsing for Jellyfin Live TV",
    "description": "Adds category browsing backed by existing Jellyfin M3U channels and bundles the matching Jellyfin Web interface.",
    "owner": "jeno",
    "category": "Live TV",
    "versions": [{
        "version": version,
        "changelog": "UI-installable package with responsive category tiles and a bundled Jellyfin Web 10.11.11 client.",
        "targetAbi": "10.11.11.0",
        "sourceUrl": f"{base_url}/{package_path.name}",
        "checksum": checksum,
        "timestamp": timestamp,
    }],
}]

manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Package: {package_path}")
print(f"Manifest: {manifest_path}")
print(f"MD5: {checksum}")
PY

echo "Catalog package created for Live TV Categories ${version}."
