# Jellyfin Live TV Category Browser

[![Latest release](https://img.shields.io/github/v/release/JeKaQM/jellyfin-live-tv-category-browser?display_name=tag)](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest)
[![Release workflow](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/actions/workflows/release.yml/badge.svg)](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/actions/workflows/release.yml)
[![License: GPL-2.0-only](https://img.shields.io/badge/license-GPL--2.0--only-blue.svg)](LICENSE)

**Live TV Categories** is an unofficial Jellyfin plugin that adds category-first browsing to **Live TV → Programmes**. It derives categories from standard M3U `group-title` metadata while keeping Jellyfin's existing channel cards, playback, guide, recording, and DVR behavior.

Current release: [v0.2.0.0](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/tag/v0.2.0.0)

> [!IMPORTANT]
> Release `0.2.0.0` supports **Jellyfin Server and Web 10.11.11 only**. Do not install it on another Jellyfin version. This is a community release, so keep a configuration backup and rollback path available before installation.

## Features

- Builds categories dynamically from `group-title` values already available to Jellyfin's native M3U tuner.
- Loads a small category summary first, then fetches only the selected category's paged channel results.
- Reuses Jellyfin's normal channel cards and item actions, preserving playback, EPG, recording, and DVR flows.
- Applies Jellyfin authentication, Live TV permission checks, and per-user item visibility.
- Uses opaque category IDs and a five-minute, atomically replaced server-side index.
- Provides responsive category tiles with mouse, keyboard, and TV-remote focus states.
- Installs through Jellyfin's plugin catalog as one package containing the server plugin and matching Web client.
- Includes automated coverage for Unicode, duplicate and uncategorised groups, paging, Web integration, packaging, and a 27,740-channel/321-category scale fixture.

## Compatibility

| Target | Release 0.2.0.0 |
| --- | --- |
| Jellyfin Server `10.11.11` | Supported |
| Jellyfin Web `10.11.11` in a browser | Supported |
| Clients that load the server-hosted Web app | Expected to work; test each client |
| Android TV / Fire TV native apps | Backend API only; no native category screen |
| Swiftfin | Backend API only; no native category screen |
| Any other Jellyfin Server/Web version | Not supported |

The package serves a complete, version-matched Jellyfin Web build from the plugin's `/web` directory while the plugin is active. It does not overwrite Jellyfin's stock Web files. Removing the plugin and restarting Jellyfin restores the normal Web application.

## Requirements

- Jellyfin Server `10.11.11` with administrator access for installation and restart.
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
3. Save, open **Catalog**, select **Live TV Categories**, and install version `0.2.0.0`.
4. Restart Jellyfin when prompted.
5. Hard-refresh the browser once to clear any cached Web shell or service worker.
6. Open **Live TV → Programmes** and select a category.

Successful startup includes these log messages:

```text
Loaded plugin: Live TV Categories 0.2.0.0
Live TV Categories is serving its bundled Jellyfin Web client
```

For upgrades, verification, and rollback instructions, see the [catalog installation guide](docs/catalog-installation.md).

## Using the category browser

The Programmes page displays **All Channels** followed by the categories discovered from the current M3U tuner data. Selecting a category loads one bounded page of standard Jellyfin channel items and renders them with Jellyfin's existing cards and actions.

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

Development requires Bash, Git, Python 3, Node.js 20 or later, and the .NET 9 SDK. Docker can provide the Node and .NET build environments when they are not installed locally.

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
PLUGIN_RELEASE_BASE_URL='https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.2.0.0' \
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

The release bundles a modified Jellyfin Web `10.11.11` build under the same license. Exact upstream and corresponding-source details are provided in [NOTICE.md](NOTICE.md). Jellyfin is a trademark of the Jellyfin Project; this community plugin is not an official Jellyfin Project release.
