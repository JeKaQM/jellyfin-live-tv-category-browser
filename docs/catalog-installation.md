# Jellyfin UI installation and release runbook

## What the release contains

`Live TV Categories 0.2.0.0` is one Jellyfin plugin package with:

- `Jellyfin.Plugin.LiveTvCategories.dll` at the package root;
- a complete, version-matched Jellyfin Web `10.11.11` build under `web/`;
- GPL-2.0 license, attribution, and exact corresponding-source information; and
- no Dispatcharr credentials, playlist data, channel URLs, API keys or user data.

The server plugin registers the category API and serves the bundled Web tree at Jellyfin's normal `/web` path. If the Web tree is unavailable, the plugin logs that it is running API-only instead of preventing Jellyfin from starting.

## Compatibility

| Target | Release 0.2.0.0 |
| --- | --- |
| Jellyfin Server 10.11.11 | Supported |
| Jellyfin Web 10.11.11 in a browser | Supported |
| Clients that load the server-hosted Web app | Expected to use the new page; test each client |
| Android TV / Fire TV native app | Backend only; native category screen still required |
| Swiftfin native app | Backend only; native category screen still required |
| Any other Jellyfin Server/Web version | Not supported by this release |

## Administrator installation

Once a release is published, its stable repository URL is:

```text
https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest/download/manifest.json
```

In Jellyfin:

1. Open **Dashboard -> Plugins -> Repositories**.
2. Select **Add**.
3. Name it `Live TV Categories` and paste the repository URL.
4. Save, open **Catalog**, and choose **Live TV Categories**.
5. Install version `0.2.0.0` and restart Jellyfin when prompted.
6. Hard-refresh the browser once so an old service worker or cached `index.html` cannot retain the previous Web shell.

Verify that the log contains both messages:

```text
Loaded plugin: Live TV Categories 0.2.0.0
Live TV Categories is serving its bundled Jellyfin Web client
```

Then open **Live TV -> Programmes** and confirm the category summary and tiles appear.

## Upgrade behavior

Jellyfin checks the same repository manifest for later compatible versions. A future release can be installed from **Dashboard -> Plugins -> Updates** and activated with a restart. Every release must match its target Jellyfin Server ABI and Web version; do not reuse a Web build across Jellyfin versions.

## Rollback

Before the first catalog test, keep the known-working manual plugin directory and Docker Web override available but disabled rather than deleting them. If the catalog release fails:

1. uninstall or disable the catalog version in **Dashboard -> Plugins**;
2. restart Jellyfin;
3. restore the previous plugin directory or Compose Web override; and
4. recreate the Jellyfin container if the override changed.

Removing the category plugin does not remove the Dispatcharr M3U tuner, XMLTV guide, channels, recordings or playback configuration.

## Publish a release

To build the same repository locally on a headless Docker host:

```bash
chmod +x scripts/build-release.sh
PLUGIN_RELEASE_BASE_URL='https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.2.0.0' \
  ./scripts/build-release.sh
```

For a temporary LAN-only catalog acceptance test, use a reachable local base URL such as `http://127.0.0.1:8787`, serve `artifacts/catalog` with a static HTTP server, and add its `/manifest.json` URL in Jellyfin. Do not treat that temporary server as the long-term repository.

The included GitHub Actions workflow publishes on an exact version tag. For `0.2.0.0`:

```bash
git tag v0.2.0.0
git push origin v0.2.0.0
```

The workflow:

1. runs the JavaScript/source checks and C# tests;
2. builds the exact Jellyfin Web `10.11.11` overlay;
3. publishes the server plugin;
4. creates the plugin ZIP and `manifest.json`; and
5. attaches both files to the GitHub release.

The GitHub repository should be public so Jellyfin can download the manifest and release ZIP without GitHub credentials.
