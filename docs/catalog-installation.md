# Jellyfin UI installation and release runbook

## What the release contains

Each Live TV Categories release is one Jellyfin plugin package with:

- `Jellyfin.Plugin.LiveTvCategories.dll` at the package root;
- a complete, version-matched Jellyfin Web build under `web/`;
- GPL-2.0 license, attribution, and exact corresponding-source information; and
- no Dispatcharr credentials, playlist data, channel URLs, API keys or user data.

The server plugin registers the category API and serves the bundled Web tree at Jellyfin's normal `/web` path. If the Web tree is unavailable, the plugin logs that it is running API-only instead of preventing Jellyfin from starting.

Plugin `0.3.0.0` contains the Jellyfin Server/Web `12.0.0` implementation, including both the modern Live TV view and the legacy Web/TV view. It also hardens category icons for LG webOS browsers and keeps the selected category open when returning from a channel. Plugin `0.2.0.0` remains the Jellyfin `10.11.11` release line.

## Compatibility

| Plugin | Jellyfin Server and Web | Status |
| --- | --- | --- |
| `0.3.0.0` | `12.0.0` | Current release |
| `0.2.0.0` | `10.11.11` | Published maintenance line |
| Either version | Clients that load the server-hosted Web app | Category UI included; test each client |
| Either version | Android TV / Fire TV and Swiftfin native apps | Backend only; native category view still required |
| Any other combination | Any other Jellyfin Server/Web version | Not supported |

## Administrator installation

The stable repository URL is:

```text
https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest/download/manifest.json
```

In Jellyfin:

1. Open **Dashboard -> Plugins -> Repositories**.
2. Select **Add**.
3. Name it `Live TV Categories` and paste the repository URL.
4. Save, open **Catalog**, and choose **Live TV Categories**.
5. Install the version matching the server: `0.3.0.0` for Jellyfin `12.0.0`, or `0.2.0.0` for Jellyfin `10.11.11`. If the matching version is not listed, stop; it has not been published to the catalog yet.
6. Restart Jellyfin when prompted.
7. Hard-refresh the browser once so an old service worker or cached `index.html` cannot retain the previous Web shell.

On Jellyfin 12, verify that the log contains both messages:

```text
Loaded plugin: Live TV Categories 0.3.0.0
Live TV Categories is serving its bundled Jellyfin Web client
```

On Jellyfin 10.11.11, the loaded-plugin line ends in `0.2.0.0`. If a version-mismatch warning appears instead of the serving message, install the plugin release that exactly matches the server.

Then open **Live TV -> Programmes** and confirm the category summary and tiles appear. On Jellyfin 12, also open a category and channel, then go back and confirm the category remains open. LG TV users should confirm the category icons render as icons rather than text or missing glyphs.

## Upgrade behavior

Jellyfin checks the same repository manifest for later compatible versions. A compatible update can be installed from **Dashboard -> Plugins -> Updates** and activated with a restart. Every release must match its target Jellyfin Server ABI and Web version; do not reuse a Web build across Jellyfin versions.

To move from Jellyfin `10.11.11` to `12.0.0`:

1. Back up Jellyfin's configuration and record the current plugin and Web deployment.
2. Uninstall or disable Live TV Categories `0.2.0.0`, restart, and confirm the stock Web client loads.
3. Upgrade both Jellyfin Server and Jellyfin Web to `12.0.0` using Jellyfin's normal upgrade procedure.
4. Confirm `0.3.0.0` is listed in this repository, install it, and restart Jellyfin.
5. Hard-refresh each browser or clear its Jellyfin site data once.

Do not carry the `0.2.0.0` Web bundle into Jellyfin 12 or install `0.3.0.0` on Jellyfin 10.11.11.

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
PLUGIN_RELEASE_BASE_URL='https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.3.0.0' \
  ./scripts/build-release.sh
```

For a temporary LAN-only catalog acceptance test, use a reachable local base URL such as `http://127.0.0.1:8787`, serve `artifacts/catalog` with a static HTTP server, and add its `/manifest.json` URL in Jellyfin. Do not treat that temporary server as the long-term repository.

The Jellyfin 12 build requires Node.js 24, npm 11, and the .NET 10 SDK; the release workflow supplies those environments. It publishes only from an exact version tag. For `0.3.0.0`:

```bash
git tag v0.3.0.0
git push origin v0.3.0.0
```

Until that tag has completed successfully and `0.3.0.0` appears on the Releases page, the Jellyfin 12 package is not published.

The workflow:

1. runs the JavaScript/source checks and C# tests;
2. builds the exact Jellyfin Web `12.0.0` modern and legacy overlay;
3. publishes the server plugin;
4. creates the plugin ZIP and `manifest.json`; and
5. attaches both files to the GitHub release.

The GitHub repository should be public so Jellyfin can download the manifest and release ZIP without GitHub credentials.
