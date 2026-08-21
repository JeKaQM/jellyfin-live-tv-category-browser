# Jellyfin Live TV Category Browser

This project adds a category-first Jellyfin Live TV landing page while keeping Jellyfin's existing playback, guide and DVR paths.

## Confirmed target

- Jellyfin Server: `10.11.11` at `http://127.0.0.1:8096`
- Dispatcharr: `http://127.0.0.1:9191`
- Dispatcharr M3U: `/output/m3u`
- Dispatcharr XMLTV: `/output/epg`
- Verified steady-state import: **27,740 channels across 321 `group-title` groups**
- Refresh Guide completed successfully on 2026-08-21 and Jellyfin published all 27,740 channels.
- Xtream Library is not required for the target design.

The unprofiled Dispatcharr M3U is the correct input because it contains every group. Jellyfin should consume Dispatcharr directly as a native M3U tuner and use Dispatcharr's XMLTV output for guide data:

```text
Provider -> Dispatcharr -> Jellyfin M3U/XMLTV -> Jellyfin clients
```

## Install from the Jellyfin UI

Release `0.2.0.0` is structured as a standard Jellyfin repository package. Its ZIP contains both the server plugin and the matching Jellyfin Web `10.11.11` client, so normal users do not need to copy a DLL or maintain a Docker Web bind mount.

After the project is published on GitHub, add this repository URL in **Dashboard -> Plugins -> Repositories**:

```text
https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/latest/download/manifest.json
```

Then open **Catalog**, install **Live TV Categories**, and restart Jellyfin when prompted. See `docs/catalog-installation.md` for the exact administrator flow, upgrades, rollback, compatibility, and release procedure.

The package is intentionally pinned to Jellyfin Server and Web `10.11.11`. Do not install it on another Jellyfin version until a matching release is published.

## Headless setup

From this project directory on the Jellyfin host:

```bash
chmod +x scripts/configure-dispatcharr-jellyfin.sh
./scripts/configure-dispatcharr-jellyfin.sh
```

The script asks for a Jellyfin administrator API key with hidden input. It then:

1. validates Dispatcharr's M3U and XMLTV endpoints;
2. reports the exported channel/group counts;
3. adds the M3U tuner and XMLTV guide only if the exact URLs are not already present;
4. starts Jellyfin's **Refresh Guide** task;
5. waits for Jellyfin to publish Live TV channels; and
6. warns if Xtream Library is still active.

It is safe to rerun: matching tuner and guide entries are left unchanged. It does not print the API key, channel URLs or user names.

Defaults already match the target. To override them:

```bash
JELLYFIN_URL=http://127.0.0.1:8096 \
DISPATCHARR_URL=http://127.0.0.1:9191 \
JELLYFIN_WAIT_SECONDS=1800 \
./scripts/configure-dispatcharr-jellyfin.sh
```

Keep Xtream Library installed until a Dispatcharr-imported channel has been tested for playback and guide data. Then disable or uninstall Xtream Library to prevent duplicate channels or a second tuner path.

See `docs/headless-setup.md` for verification and troubleshooting commands.

## Category-browser status

Completed:

- confirmed Dispatcharr supplies all required categories through standard M3U `group-title` values;
- added and tested the idempotent Dispatcharr-to-Jellyfin setup script;
- inspected Jellyfin 10.11.11's M3U and Live TV metadata flow;
- confirmed from a populated target that neither `/LiveTv/Channels` nor generic item DTOs expose a category/group or usable tags;
- defined a credential-safe category API contract;
- implemented a dependency-free summary-first client service;
- implemented the ABI-pinned `Jellyfin.Plugin.LiveTvCategories` bridge for Jellyfin 10.11.11;
- added per-user visibility projection, five-minute atomic caching, opaque category IDs and paged standard Jellyfin channel DTOs;
- prepared a guarded Jellyfin Web `v10.11.11` Programmes-tab overlay that reuses the upstream channel card renderer;
- deployed and smoke-tested the category API and Web overlay against the populated target;
- added responsive, icon-led category tiles with visible mouse, keyboard and TV-remote focus states;
- added a single UI-installable catalog package containing the server DLL and version-matched Web client;
- added a GitHub release workflow that publishes the package ZIP and Jellyfin `manifest.json`; and
- added tests covering the verified 27,740-channel/321-group scale, Unicode, duplicates, uncategorised channels, pagination, the Web overlay, and catalog structure.

Next:

- publish the `v0.2.0.0` release;
- test a clean install through Jellyfin's Catalog and remove the development-only Compose Web override; and
- implement a separate native client view later for Android TV/Fire TV and Swiftfin.

Direct Dispatcharr ingestion does not by itself make categories queryable in Jellyfin Web. Jellyfin's M3U parser receives `group-title` as `ChannelInfo.ChannelGroup`, but Jellyfin 10.11.11 does not persist that value on `LiveTvChannel` or expose a group filter on `/LiveTv/Channels`. The category bridge therefore remains an organizational API only; it will not proxy, rewrite or transcode streams.

The temporary 83,220-entry observation disappeared after Dispatcharr was corrected. The completed Jellyfin refresh and latest sanitized bundle both report the expected 27,740 channels.

## Build the category bridge

The bridge is pinned to Jellyfin `10.11.11` and `.NET 9`; it must not be installed on a different Jellyfin ABI without updating and rebuilding the package references.

On the headless Jellyfin host:

```bash
chmod +x scripts/build-plugin.sh
./scripts/build-plugin.sh
```

The script runs the C# unit tests and creates:

```text
artifacts/plugin/Jellyfin.Plugin.LiveTvCategories.dll
```

The bridge reads category metadata from Jellyfin's existing native M3U tuner cache. It maps those records to persisted `LiveTvChannel` IDs, applies the requesting user's Jellyfin visibility rules and returns only standard Jellyfin DTOs. It never returns `ChannelInfo.Path`, tuner configuration, Dispatcharr URLs, credentials or media sources.

See `docs/headless-plugin.md` for build, installation and API smoke-test commands.

## Build the UI-installable catalog package

The convenience builder auto-detects local Node/.NET or falls back to Docker:

```bash
PLUGIN_RELEASE_BASE_URL='https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.2.0.0' \
  ./scripts/build-release.sh
```

The individual `prepare-jellyfin-web.sh`, `build-plugin.sh`, and `build-catalog.sh` scripts remain available for CI and debugging.

This creates:

```text
artifacts/catalog/Jellyfin.Plugin.LiveTvCategories_0.2.0.0.zip
artifacts/catalog/manifest.json
```

The release ZIP contains `Jellyfin.Plugin.LiveTvCategories.dll`, the full built Web client under `web/`, and its license/source notices. The plugin serves that bundled Web client at `/web`; if the `web/` directory is absent, the server endpoints remain available in API-only mode.

## Jellyfin Web overlay

`scripts/prepare-jellyfin-web.sh` clones or validates the official `v10.11.11` Web source, replaces its two Programmes-tab source files, and adds one scoped category-tile stylesheet. It checks the upstream Git object hashes first and refuses a different or locally modified version. It does not alter Guide, Channels, Recordings, Schedule, Series, playback or DVR code.

The normal release path bundles the built Web tree in the catalog ZIP. The read-only Docker bind-mount method in `docs/headless-web.md` remains useful for development, recovery, and comparison testing.

Web styling applies to browsers and clients that load the server-hosted Jellyfin Web application. Native clients such as Android TV/Fire TV and Swiftfin do not inherit this Web patch; they can consume the same category API but require their own client UI implementation.

## Intended request flow

```text
Open Live TV -> Programmes
  -> GET /LiveTvCategories
  -> render All Channels + 321 dynamic category rows

Select a category
  -> GET /LiveTvCategories/{opaqueId}/Channels?startIndex=0&limit=100
  -> render only that page with Jellyfin's normal channel cards

Select a channel
  -> use Jellyfin's existing item action, playback and DVR path
```

The browser never downloads the full tens-of-thousands-channel playlist to build the menu.

## Tests

```bash
npm test
npm run check
bash -n scripts/configure-dispatcharr-jellyfin.sh
```

No npm dependencies are required.

## Important files

- `scripts/configure-dispatcharr-jellyfin.sh` — headless, idempotent direct setup.
- `scripts/build-plugin.sh` — build and test the ABI-pinned server bridge.
- `scripts/build-catalog.sh` — package the DLL plus Web client and generate a Jellyfin repository manifest.
- `scripts/build-release.sh` — one-command Web, plugin and catalog build with a Docker fallback.
- `.github/workflows/release.yml` — test, build and publish tagged releases.
- `LICENSE` and `NOTICE.md` — GPL-2.0 terms and Jellyfin Web/source attribution.
- `docs/headless-setup.md` — runbook and troubleshooting.
- `docs/headless-plugin.md` — bridge build/install/smoke-test runbook.
- `docs/headless-web.md` — guarded Jellyfin Web 10.11.11 build/deployment preparation.
- `docs/catalog-installation.md` — UI installation, upgrade, rollback and publishing runbook.
- `DISCOVERY.md` — verified target and upstream findings.
- `docs/architecture.md` — server/client boundary.
- `docs/api-contract.yaml` — version-neutral endpoint contract.
- `prototype/category-index.mjs` — tested server-side grouping/index model.
- `Jellyfin.Plugin.LiveTvCategories/` — Jellyfin 10.11.11 category API bridge.
- `web/src/category-service.mjs` — summary-first client data service.
- `web/src/category-page.mjs` — Jellyfin-style, text-safe list renderer.
- `web/patches/jellyfin-web-10.11.11/` — exact Programmes-tab overlay for the official Web tag.
