# Catalog installation and release runbook

## Package contents

Plugin `0.6.0.0` packages:

- `Jellyfin.Plugin.LiveTvCategories.dll`, built against the minimum tested Jellyfin 12.0 ABI.
- `category-browser/` with `index.html`, `browser-core.js`, `app.js` and `app.css`.
- A complete pinned Jellyfin Web `12.2.0` tree under `web/`.
- `COMPATIBILITY.json`, license, attribution and corresponding-source information.

No playlists, provider credentials, API keys or user data are included. The independent browser is served separately from bundled Web. The plugin never overwrites stock Jellyfin Web files.

## Compatibility

| Plugin | Supported Server | Category experience |
| --- | --- | --- |
| `0.6.0.0` | `12.0.0`, `12.1.0`, `12.2.0` | API and independent browser on all three; integrated Programmes on 12.2.0 only |
| `0.5.0.0` | `12.2.0` | Earlier integrated release |
| `0.4.0.0` | `12.1.0` | Earlier integrated release |
| `0.3.0.0` | `12.0.0` | Earlier integrated release |
| `0.2.0.0` | `10.11.11` | Earlier integrated release |

The same `0.6.0.0` minimum-ABI DLL has been tested on the three declared Jellyfin 12 versions. Catalog minimum-ABI eligibility alone does not prove compatibility with an arbitrary newer version. Full bundled Web remains exact-version guarded.

Clients that load server-hosted Web can use the integrated screen on 12.2.0. A suitable browser can use the independent screen on all three tested servers. Native Android TV/Fire TV and Swiftfin do not acquire a native category screen.

## Install

Add this repository in **Dashboard → Plugins → Repositories**:

```text
https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest/download/manifest.json
```

1. Name it `Live TV Categories`, save, and open **Catalog**.
2. Install `0.6.0.0` on a tested Jellyfin 12 server once it is listed. If it is absent, it has not been published yet; do not assume a source tag or probe is a release.
3. Restart Jellyfin, then hard-refresh the browser.
4. Open `/LiveTvCategories/ui/`, including any configured BaseUrl: `/jellyfin/LiveTvCategories/ui/`.
5. Sign in with your normal Jellyfin account. Administrator access is needed for installation, not browsing.
6. On `12.2.0`, also check **Live TV → Programmes** if you want integrated browsing.

Expected log messages:

```text
Loaded plugin: Live TV Categories 0.6.0.0
Live TV Categories independent browser is available at .../LiveTvCategories/ui
```

On `12.2.0`, startup also confirms the bundled Jellyfin Web client is served. On `12.0.0` and `12.1.0`, its version-mismatch warning is expected: stock Web remains active while the independent browser works.

Verify a category, page forward, open a channel and use browser Back. The category, page and focus should return. Independent-browser channels open ordinary Jellyfin details/playback, which may require a separate Web sign-in. Check icons and remote focus on your actual TV; physical LG hardware is not covered by automated browser tests.

## Upgrades

Jellyfin checks the repository for compatible plugin updates. Install through **Dashboard → Plugins → Updates** and restart.

Within the tested `12.0.0`/`12.1.0`/`12.2.0` set, `0.6.0.0` provides the backend and independent browser without requiring a different DLL for each version. Its full Web integration activates only on `12.2.0`; do not force that build onto the other servers.

Before a Jellyfin upgrade:

1. Back up Jellyfin configuration and record plugin versions, server/Web versions and manual overrides.
2. Check the plugin's declared support and compatibility results for the destination version.
3. If the destination is untested, disable or uninstall the plugin and restart before upgrading through Jellyfin's supported procedure.
4. Confirm stock Web works. Install or re-enable the plugin only once that server version is explicitly supported.
5. Restart and refresh client site data as needed.

Users upgrading from 10.11.11 must follow Jellyfin's supported server upgrade path. Older plugin releases still require their exact matching Server/Web versions.

## Rollback

1. Disable or uninstall the catalog plugin.
2. Restart Jellyfin.
3. Confirm stock Web loads; hard-refresh or clear Jellyfin site data if an old shell remains.
4. Install an older plugin only when its supported Server/Web combination matches the running server.

Removing the plugin does not remove tuners, XMLTV guides, channels, recordings or playback configuration. Rolling back Jellyfin itself requires its supported backup/restore procedure. Disable old manual Web bind mounts or plugin directories unless they match the restored server.

## Build and publish

Use Node 24, npm 11, .NET 10, Bash, Git and Python 3 for a complete release build:

```bash
PLUGIN_RELEASE_BASE_URL='https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.6.0.0' \
bash scripts/build-release.sh
```

The catalog builder requires all four published independent-browser assets, includes `COMPATIBILITY.json`, computes the package checksum and retains the historical `0.5.0.0` through `0.2.0.0` entries.

Only tag the intended, tested release commit:

```bash
git tag -a v0.6.0.0 -m "Live TV Categories 0.6.0.0"
git push origin v0.6.0.0
```

The release workflow runs compatibility checks, builds the pinned Web client and plugin, packages the ZIP and manifest, then publishes assets. The release is available only when those checks finish successfully and `0.6.0.0` appears on [GitHub Releases](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases).

Scheduled compatibility checks and master canaries do not publish releases or widen the allowlist automatically. Keep the GitHub repository public so Jellyfin can fetch the manifest and ZIP without GitHub credentials.
