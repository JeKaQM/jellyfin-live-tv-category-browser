# Jellyfin Live TV Category Browser

[![Latest release](https://img.shields.io/github/v/release/JeKaQM/jellyfin-live-tv-category-browser?display_name=tag)](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest)
[![Release workflow](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/actions/workflows/release.yml/badge.svg)](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/actions/workflows/release.yml)
[![License: GPL-2.0-only](https://img.shields.io/badge/license-GPL--2.0--only-blue.svg)](LICENSE)

**Live TV Categories** is an unofficial Jellyfin plugin that adds category-first browsing to **Live TV → Programmes**. It derives categories from standard M3U `group-title` metadata while keeping Jellyfin's existing channel cards, playback, guide, recording, and DVR behavior.

Published packages are available from [GitHub Releases](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest). Each plugin version is tied to one exact Jellyfin Server and Web version.

> [!IMPORTANT]
> Plugin `0.3.0.0` supports **Jellyfin Server and Web 12.0.0 only**. Plugin `0.2.0.0` remains the compatible line for **Jellyfin Server and Web 10.11.11**. Do not install either package on a different Jellyfin version.

## Features

- Builds categories dynamically from `group-title` values already available to Jellyfin's native M3U tuner.
- Loads a small category summary first, then fetches only the selected category's paged channel results.
- Reuses Jellyfin's normal channel cards and item actions, preserving playback, EPG, recording, and DVR flows.
- Applies Jellyfin authentication, Live TV permission checks, and per-user item visibility.
- Uses opaque category IDs and a five-minute, atomically replaced server-side index.
- Provides responsive category tiles with mouse, keyboard, and TV-remote focus states.
- Integrates with both Jellyfin 12's modern Live TV view and its legacy Web/TV view.
- Uses TV-safe category icons that do not render Material icon names as text on LG webOS clients.
- Restores the selected category, page, and focus when returning from a channel instead of exiting the category.
- Installs through Jellyfin's plugin catalog as one package containing the server plugin and matching Web client.
- Includes automated coverage for Unicode, duplicate and uncategorised groups, paging, Web integration, packaging, and a 27,740-channel/321-category scale fixture.

## Compatibility

| Plugin | Jellyfin Server and Web | Status |
| --- | --- | --- |
| `0.3.0.0` | `12.0.0` | Current release |
| `0.2.0.0` | `10.11.11` | Published maintenance line for Jellyfin 10.11.11 |
| Either version | Clients that load the server-hosted Web app | Category UI included; test the specific browser or TV client |
| Either version | Android TV / Fire TV native apps and Swiftfin | Backend API only; no native category screen |
| Any other combination | Any other Jellyfin Server/Web version | Not supported |

The package serves a complete, version-matched Jellyfin Web build from the plugin's `/web` directory while the plugin is active. Jellyfin's catalog treats `targetAbi` as a minimum version, so the plugin also checks the running server version and disables its bundled Web client unless it is the exact supported version. It does not overwrite Jellyfin's stock Web files. Removing the plugin and restarting Jellyfin restores the normal Web application.

## Requirements

- Jellyfin Server and server-hosted Web `12.0.0` for plugin `0.3.0.0`, or `10.11.11` for plugin `0.2.0.0`, with administrator access for installation and restart.
- An existing native Jellyfin M3U tuner whose playlist contains `group-title` metadata.
- A completed Live TV guide refresh so the tuner channels are available to Jellyfin.

Dispatcharr is supported as an optional M3U/XMLTV source, but it is not required. The plugin organizes channels already known to Jellyfin; it does not add an IPTV provider or replace tuner setup.

## Install from the Jellyfin catalog

Use this stable repository manifest URL:

```text
https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest/download/manifest.json
```

1. Open **Dashboard → Plugins → Repositories** in Jellyfin.
2. Select **Add**, name the repository `Live TV Categories`, and paste the manifest URL.
3. Save, open **Catalog**, and select **Live TV Categories**.
4. On Jellyfin `12.0.0`, install `0.3.0.0`. On Jellyfin `10.11.11`, install `0.2.0.0`.
5. Restart Jellyfin when prompted.
6. Hard-refresh the browser once to clear any cached Web shell or service worker.
7. Open **Live TV → Programmes** and select a category.

On Jellyfin 12, successful startup includes these log messages:

```text
Loaded plugin: Live TV Categories 0.3.0.0
Live TV Categories is serving its bundled Jellyfin Web client
```

On Jellyfin 10.11.11, the first line ends in `0.2.0.0` instead. A version-mismatch warning means the bundled category UI was intentionally disabled; install the matching plugin release.

For upgrades, verification, and rollback instructions, see the [catalog installation guide](docs/catalog-installation.md).

## Using the category browser

The Programmes page displays **All Channels** followed by the categories discovered from the current M3U tuner data. Selecting a category loads one bounded page of standard Jellyfin channel items and renders them with Jellyfin's existing cards and actions. Jellyfin 12's modern view keeps the category in the page URL, while the legacy Web/TV view retains equivalent in-page state. In both views, opening a channel and going back returns to the category and its prior position.

Category data is cached for five minutes. After changing the source playlist, allow Jellyfin's guide refresh to finish and then allow the category cache to expire. If the category API is unavailable, **All Channels** remains available as a fallback.

## Optional Dispatcharr setup helper

The included idempotent helper can configure Dispatcharr's M3U and XMLTV outputs as native Jellyfin sources:

```bash
chmod +x scripts/configure-dispatcharr-jellyfin.sh
JELLYFIN_URL=http://127.0.0.1:8096 \
DISPATCHARR_URL=http://127.0.0.1:9191 \
./scripts/configure-dispatcharr-jellyfin.sh
```

The script prompts for a Jellyfin administrator API key using hidden input, validates both endpoints, avoids duplicate tuner/guide entries, starts a guide refresh, and waits for channels to appear. See the [headless setup guide](docs/headless-setup.md) for requirements and troubleshooting.

## How it works

```text
M3U group-title metadata
  → Jellyfin native tuner cache
  → short-lived category index and per-user visibility filter
  → category summary or selected-category page
  → Jellyfin's existing channel cards, playback, guide, and DVR paths
```

The authenticated API exposes:

- `GET /LiveTvCategories` for category IDs, names, and channel counts; and
- `GET /LiveTvCategories/{opaqueId}/Channels` for paged, visible Jellyfin channel DTOs.

This is an organizational layer. It does not proxy, rewrite, or transcode streams, and it does not alter tuner, XMLTV, guide, playback, recording, or DVR configuration. See [architecture](docs/architecture.md) and the [API contract](docs/api-contract.yaml) for implementation details.

## Access and privacy boundaries

- Both endpoints require Jellyfin authentication and Live TV access.
- Category results are projected through the requesting user's Jellyfin visibility rules.
- The summary response contains only category ID, name, and channel count.
- Responses do not expose tuner configuration, provider URLs, credentials, stream paths, or media sources.
- Logs contain counts rather than channel names or provider details.

The release artifacts contain no playlist data, channel URLs, API keys, credentials, or user data.

## Troubleshooting and removal

- **No categories:** confirm the active native M3U playlist contains `group-title` values and that Jellyfin's guide refresh has completed.
- **The old Programmes page remains:** restart Jellyfin, then hard-refresh the browser or clear its Jellyfin site data.
- **Plugin loaded in API-only mode:** confirm the installed plugin directory contains the bundled `web/` tree, not only the DLL.
- **Unsupported Jellyfin version:** uninstall the plugin and use the stock Web client until a matching release is available.

Removing the plugin does not remove the M3U tuner, XMLTV guide, channels, recordings, or playback configuration. Detailed recovery steps are in the [catalog rollback guide](docs/catalog-installation.md#rollback).

## Build and test

Development of the Jellyfin 12 line requires Bash, Git, and Python 3 locally. Use Node.js 24 with npm 11 and the .NET 10 SDK, or let Docker provide either build environment. The older `v0.2.0.0` tag retains the Jellyfin 10.11.11/.NET 9/Node 20 build instructions for that release line.

Run the source and integration tests:

```bash
npm test
npm run check
```

Build and test the server plugin:

```bash
chmod +x scripts/build-plugin.sh
./scripts/build-plugin.sh
```

Build the complete Web client, plugin ZIP, and repository manifest:

```bash
chmod +x scripts/build-release.sh
PLUGIN_RELEASE_BASE_URL='https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.3.0.0' \
./scripts/build-release.sh
```

Build outputs are written under `artifacts/`. Version tags trigger the [release workflow](.github/workflows/release.yml), which validates the tag, runs the tests, builds the pinned Web client and server plugin, packages the catalog, and publishes the release assets.

## Documentation

- [Catalog installation, upgrades, and rollback](docs/catalog-installation.md)
- [Dispatcharr-to-Jellyfin headless setup](docs/headless-setup.md)
- [Server plugin development and API smoke tests](docs/headless-plugin.md)
- [Jellyfin Web overlay development and recovery](docs/headless-web.md)
- [Architecture](docs/architecture.md)
- [OpenAPI contract](docs/api-contract.yaml)

## Support

Use [GitHub Issues](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/issues) for reproducible bugs and compatibility reports. Include the Jellyfin version, plugin version, client type, relevant sanitized logs, and reproduction steps.

Do not post API keys, M3U/XMLTV URLs, provider credentials, playlist contents, stream URLs, or private channel/user data.

## License and attribution

Copyright © 2026 Jeno. This project is licensed under [GPL-2.0-only](LICENSE).

Plugin `0.3.0.0` bundles a modified Jellyfin Web `12.0.0` build under the same license; plugin `0.2.0.0` bundles Jellyfin Web `10.11.11`. Exact upstream and corresponding-source details are provided in [NOTICE.md](NOTICE.md). Jellyfin is a trademark of the Jellyfin Project; this community plugin is not an official Jellyfin Project release.
