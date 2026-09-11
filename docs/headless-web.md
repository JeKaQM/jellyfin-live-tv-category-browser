# Headless Jellyfin Web 12.0.0 runbook

The prepared `0.3.0.0` overlay changes only **Live TV -> Programmes** in Jellyfin Web `12.0.0`. It integrates with both the modern Live TV view and the legacy Web/TV controller. Each view requests the small `/LiveTvCategories` summary, shows `All Channels` plus every dynamic group, and requests one bounded page only after a category is selected. Channel cards still use Jellyfin Web's existing card components, so normal item actions and playback are preserved.

The category tiles include counts, responsive sizing, and visible keyboard/remote focus. The legacy path uses class-based icon glyphs instead of icon-name ligature text for compatibility with older LG webOS browser engines. Both integrations preserve the selected category, page, and focus when channel details closes.

Do not start this step until the Jellyfin 12 server bridge is installed and its API smoke test reports the category and represented-channel counts expected for your tuner. For Jellyfin `10.11.11`, use plugin release/tag `v0.2.0.0`; do not apply this Jellyfin 12 overlay.

## 1. Identify the deployed Web package

Run this on the Jellyfin host:

```bash
dpkg-query -W -f='${Package} ${Version}\n' jellyfin-web 2>/dev/null || rpm -q jellyfin-web 2>/dev/null || true; sudo docker inspect jellyfin --format 'image={{.Config.Image}}' 2>/dev/null || true
```

Proceed with this overlay only when the package or official container image is paired with Jellyfin Web `12.0.0`. If it reports another version, stop; the guard intentionally does not patch it.

## 2. Prepare exact source

Install Bash, Git, and Python 3 locally, then run this from the project directory:

```bash
chmod +x scripts/prepare-jellyfin-web.sh
./scripts/prepare-jellyfin-web.sh
```

The script clones the official `v12.0` tag at commit `0e83c6a724b31f3e9b5a499244331a288c060a4a` into `build/jellyfin-web-12.0` unless `JELLYFIN_WEB_SOURCE` points to an existing checkout. Before copying the overlay, it verifies the package version, commit, and protected upstream source hashes. Jellyfin 12 moved the legacy controller under `src/apps/legacy` and made the modern route the default, so both source trees are covered.

| File | Expected upstream blob |
| --- | --- |
| `src/apps/legacy/controllers/livetv/livetvsuggested.js` | `49699fd4f2588f0be26f5f421e3ee44bddaf6f09` |
| `src/apps/legacy/controllers/livetv.html` | `365c5b4415c55f50eccab101bfd483390ab90eab` |
| `src/apps/modern/features/libraries/components/PageTabContent.tsx` | `430e09f6737f18ed1c06210a18cf62d556717922` |

The overlay also adds category-view and styling files to the legacy and modern source trees. There are no upstream files at those overlay-only paths. The preparation script refuses unexpected or already-customized protected source rather than overwriting it silently.

## 3. Build

With Node 24 and npm 11 or later installed:

```bash
BUILD_WEB=1 ./scripts/prepare-jellyfin-web.sh
```

Or build the prepared checkout in Docker (Bash, Git, and Python 3 are still used locally by the preparation step):

```bash
sudo docker run --rm --user "$(id -u):$(id -g)" -e NPM_CONFIG_CACHE=/tmp/npm-cache -v "$PWD/build/jellyfin-web-12.0:/src" -w /src node:24-bookworm bash -lc 'npm ci && npm run build:production'
```

The compiled Web tree is created under:

```text
build/jellyfin-web-12.0/dist
```

## 4. Deployment choices

The preferred production path is the UI-installable catalog ZIP described in `docs/catalog-installation.md`. It bundles this compiled `dist` tree alongside the server plugin and serves it without replacing the official Jellyfin files.

The bind-mount method below is retained as a development and recovery path.

The manual deployment method depends on whether Jellyfin is a native package, an official container, or a custom Compose stack. Do not copy `dist` over a guessed path.

Before deployment, record:

- the native `jellyfin-web` directory, or the container path serving Web assets;
- the host bind mount or image definition that owns that path;
- a recoverable backup/rollback location;
- the exact container/service name.

For a container, prefer a custom image or a read-only bind mount of the built `dist` directory. Copying files directly into a running container is lost when the container is recreated.

## 5. Web acceptance checks

After deployment and a hard browser refresh:

1. The existing top tabs remain: Programmes, Guide, Channels, Recordings, Schedule and Series.
2. Programmes initially requests `/LiveTvCategories`, not `/LiveTv/Channels` or the full channel collection.
3. `All Channels` switches to the unchanged Channels tab.
4. A group opens only its own paged channels.
5. Logos, current-program text, details menu and playback work through the existing card implementation.
6. Open a channel, then go back: the same category, page, and focused channel are restored rather than exiting the category.
7. The visible category-back action returns to the category list.
8. On an LG TV, category and chevron icons render as icons rather than visible names, missing glyphs, or stretched tiles.
9. An API failure still leaves `All Channels` available.

The overlay is Web-only. It is shared by clients that load the server-hosted Web application, but Android TV/Fire TV, Swiftfin and other native clients require separate client work.
