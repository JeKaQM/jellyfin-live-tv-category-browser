# Jellyfin Live TV Category Browser

[![Latest release](https://img.shields.io/github/v/release/JeKaQM/jellyfin-live-tv-category-browser?display_name=tag)](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest)
[![Compatibility checks](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/actions/workflows/compatibility.yml/badge.svg)](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/actions/workflows/compatibility.yml)
[![License: GPL-2.0-only](https://img.shields.io/badge/license-GPL--2.0--only-blue.svg)](LICENSE)

Live TV Categories is an unofficial Jellyfin plugin for category-first browsing of native M3U channels. It derives categories from `group-title` metadata and leaves playback, guide, recording and DVR behavior to Jellyfin.

Version `0.6.0.0` separates the durable category API and independent browser from the version-specific **Live TV → Programmes** integration. The same server plugin has been tested on Jellyfin `12.0.0`, `12.1.0` and `12.2.0`; the bundled Programmes integration remains restricted to `12.2.0`.

> [!IMPORTANT]
> Install `0.6.0.0` only once it appears in the catalog or [GitHub Releases](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest). A source version or successful compatibility probe is not a published release. Future Jellyfin versions are not automatically supported.

## Features

- Dynamic M3U categories, including Unicode and uncategorised channels.
- Small category summaries followed by bounded, selected-category channel pages.
- Normal Jellyfin authentication, current Live TV permissions and per-user channel visibility.
- An independent category browser that does not depend on Jellyfin Web internals.
- Version-checked Programmes integration for both Jellyfin 12.2 Web layouts.
- Owned SVG category controls without icon-font dependencies.
- Category, page and focus restoration after returning from a channel.
- Safe recovery from failed tuners, with ordinary Jellyfin browsing available as a fallback.
- Real-server, real-browser, permission, packaging and large-scale fixture tests.

## Compatibility

| Plugin | Jellyfin Server | Category API and independent browser | Bundled Programmes integration |
| --- | --- | --- | --- |
| `0.6.0.0` | `12.0.0`, `12.1.0`, `12.2.0` | Tested with the same minimum-ABI DLL | `12.2.0` only |
| `0.5.0.0` | `12.2.0` | Earlier API; no independent browser | `12.2.0` |
| `0.4.0.0` | `12.1.0` | Earlier API; no independent browser | `12.1.0` |
| `0.3.0.0` | `12.0.0` | Earlier API; no independent browser | `12.0.0` |
| `0.2.0.0` | `10.11.11` | Earlier API; no independent browser | `10.11.11` |

The `0.6.0.0` package targets the minimum Jellyfin `12.0.0.0` ABI. Its backend and independent browser have passed real-server and Chromium checks on all three declared versions, including a configured `/jellyfin` BaseUrl. That does not promise compatibility with an arbitrary newer ABI.

The complete bundled Web client is served only on its exact tested server version. On `12.0.0` and `12.1.0`, stock Jellyfin Web stays active and the independent browser supplies the category screen. On an unknown server version, bundled Web stays disabled; the backend may still need an update. Stock Web files are never overwritten.

Android TV, Fire TV and Swiftfin native apps do not gain a native category screen. Clients with a suitable browser can open the independent page. Physical LG/webOS hardware has not been tested; verify your specific TV even though the category controls no longer depend on icon fonts.

## Requirements

- A supported Jellyfin Server version and administrator access to install the plugin and restart.
- A native Jellyfin M3U tuner with `group-title` metadata.
- A completed guide refresh so Jellyfin has persisted the tuner channels.

Dispatcharr is an optional M3U/XMLTV source, not a requirement. This plugin organizes channels already known to Jellyfin; it does not add a provider or replace tuner setup.

## Install from the Jellyfin catalog

Add this repository in **Dashboard → Plugins → Repositories**:

```text
https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest/download/manifest.json
```

1. Name the repository `Live TV Categories`, save, and open **Catalog**.
2. Install `0.6.0.0` on one of its three tested Jellyfin 12 versions once that release is listed. Older published entries remain available for their exact versions.
3. Restart Jellyfin, then hard-refresh the browser once.
4. Open `/LiveTvCategories/ui/` on your server. Include the configured BaseUrl, for example `/jellyfin/LiveTvCategories/ui/`.
5. On Jellyfin `12.2.0`, you can also use **Live TV → Programmes**.

Successful `0.6.0.0` startup includes:

```text
Loaded plugin: Live TV Categories 0.6.0.0
Live TV Categories independent browser is available at .../LiveTvCategories/ui
```

On `12.2.0`, a further message confirms the bundled Web client is being served. A bundled-Web mismatch warning on `12.0.0` or `12.1.0` is expected and does not disable the independent browser.

See the [catalog installation guide](docs/catalog-installation.md) for upgrades, verification and rollback.

## Using the category browser

The independent page uses your normal Jellyfin username and password; browsing does not require administrator access. It never saves your password and keeps its own session token in tab-scoped storage. Sign out clears that session without changing Jellyfin Web's separate login.

Choose **All channels** or a category. Channels open in normal Jellyfin for details and playback; you may need to sign in there separately. Browser Back restores the category, page and focused channel. The page's Back button returns to the category list. Arrow keys and TV remote Back work without interfering with text inputs.

The integrated Programmes view on `12.2.0` uses Jellyfin's existing cards and item actions. Other Live TV tabs remain unchanged.

Only shared category metadata is cached, normally for five minutes. User permissions and channel visibility are read again on every request. Partial tuner failures keep healthy categories and retry metadata sooner; a completely unavailable source returns a retryable error instead of an empty success. After changing a playlist, let the guide refresh finish and the category cache expire.

## Durability and safety

Jellyfin-dependent server calls are isolated behind a compatibility adapter. Our category grouping and permission-aware cache do not import tuner implementations. Web integration uses a small checked patch to two upstream files; category behavior, adapters and SVG controls live in owned modules. Upstream legacy HTML remains untouched.

One declaration, [web/compatibility.json](web/compatibility.json), records the Web source pin, protected hashes and supported versions. Preparation is idempotent and transactional: unknown local customizations are refused before changes are applied.

Scheduled compatibility checks exercise the declared stable versions and the latest stable release. Upstream master canary builds give early warning; passing a probe does not automatically publish a release, widen compatibility or enable an untested Web client.

The authenticated API includes:

- `GET /LiveTvCategories`: category summaries.
- `GET /LiveTvCategories/{opaqueId}/Channels`: bounded pages of visible Jellyfin channel DTOs.
- `GET /LiveTvCategories/Compatibility`: minimal contract and integration status.
- `GET /LiveTvCategories/Diagnostics`: administrator-only, count-based source diagnostics.

Provider URLs and credentials are not included in category summaries or diagnostics. Logs use counts, not provider details. The release artifacts contain no playlist, API-key or user data. See [architecture](docs/architecture.md) and the [API contract](docs/api-contract.yaml).

## Optional Dispatcharr setup helper

```bash
chmod +x scripts/configure-dispatcharr-jellyfin.sh
JELLYFIN_URL=http://127.0.0.1:8096 \
DISPATCHARR_URL=http://127.0.0.1:9191 \
./scripts/configure-dispatcharr-jellyfin.sh
```

The helper prompts for an administrator API key using hidden input, uses supported authentication headers, avoids duplicate tuner/guide entries and waits for refreshed channels. See [headless setup](docs/headless-setup.md). Never put an administrator API key into the independent browser.

## Troubleshooting and removal

- **No categories:** check M3U groups and guide refresh; allow metadata cache expiry.
- **Programmes unchanged on 12.0 or 12.1:** expected; use `/LiveTvCategories/ui/`.
- **Independent page missing:** check the installed `category-browser/` assets; a DLL-only install supplies only the API.
- **Old Web interface on 12.2:** restart, then hard-refresh or clear Jellyfin site data.
- **Category source unavailable:** use All channels or normal Jellyfin; inspect administrator diagnostics.
- **Unknown Jellyfin version:** do not force-enable the bundled Web client. Check compatibility results and wait for an explicitly supported release.

Uninstalling the plugin and restarting restores stock Web without removing tuners, guide data, channels or recordings. See [rollback](docs/catalog-installation.md#rollback).

## Build and test

Use Node.js 24, npm 11, the .NET 10 SDK, Bash and Git. Python 3 is needed for catalog packaging, not for Web preparation. Docker can provide the Web and .NET build environments.

```bash
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:browser
bash scripts/build-plugin.sh
```

Build the complete catalog package:

```bash
PLUGIN_RELEASE_BASE_URL='https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.6.0.0' \
bash scripts/build-release.sh
```

Outputs are under `artifacts/`. Version tags trigger the [release workflow](.github/workflows/release.yml); a release is available only after its checks succeed and assets appear on GitHub.

## Documentation and support

- [Catalog installation, upgrades and rollback](docs/catalog-installation.md)
- [Dispatcharr headless setup](docs/headless-setup.md)
- [Server development and real-server smoke tests](docs/headless-plugin.md)
- [Web patch preparation and recovery](docs/headless-web.md)
- [Architecture](docs/architecture.md)
- [OpenAPI contract](docs/api-contract.yaml)

Report reproducible issues on [GitHub Issues](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/issues). Include versions, client type, sanitized logs and reproduction steps. Do not post API keys, provider URLs, playlists, credentials or private channel/user data.

## License

Copyright © 2026 Jeno. Licensed under [GPL-2.0-only](LICENSE). The package bundles a modified Jellyfin Web `12.2.0` build under the same license; exact corresponding-source attribution is in [NOTICE.md](NOTICE.md). Jellyfin is a trademark of the Jellyfin Project. This community plugin is not an official Jellyfin release.
