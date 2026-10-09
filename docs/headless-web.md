# Jellyfin Web integration and independent browser

Plugin `0.6.0.0` has two interfaces:

- The independent page at `/LiveTvCategories/ui/` works with the tested backend on Jellyfin `12.0.0`, `12.1.0` and `12.2.0` without replacing stock Web.
- The bundled **Live TV → Programmes** integration targets Jellyfin Web `12.2.0` only and is served only on the exact supported server version.

Both leave channel playback to Jellyfin. Use the [catalog package](catalog-installation.md) for production rather than replacing system Web files.

## Independent page

`web/standalone/{index.html,browser-core.js,app.js,app.css}` is published as `category-browser/` beside the DLL. These assets have no Jellyfin Web imports, runtime dependencies or external fonts; JavaScript remains ES5-compatible. The server adds a trailing slash to `/LiveTvCategories/ui` and serves stable asset names with no-store headers and a same-origin content security policy.

Normal-user sign-in uses Jellyfin's public authentication endpoint and supported Authorization header. Passwords are never saved. Only the page's own token and navigation state are kept in memory or tab-scoped session storage. All server/category/channel text is rendered as text, not HTML.

Channels open stock Web's details route, so Web may require a separate sign-in. Browser Back restores category/page/focus. Expired sessions return to login. Permission failures remain denied; category errors retain All channels and the normal-Jellyfin link.

## Prepare the exact Web source

Use Node 24, Bash and Git; Python is not required for preparation:

```bash
bash scripts/prepare-jellyfin-web.sh
```

`web/compatibility.json` declares the current exact tag, commit, protected hashes and allowlist. The preparer clones `v12.2` at `61b1f890365ad15138e943e694af723c1d47df2a` into `build/jellyfin-web-12.2`, or checks the checkout supplied through `JELLYFIN_WEB_SOURCE`.

Only two upstream files receive small checked integration hooks:

- `src/apps/legacy/controllers/livetv/livetvsuggested.js`.
- `src/apps/modern/features/libraries/components/PageTabContent.tsx`.

The legacy `livetv.html` stays unchanged and is fingerprinted as a protected input. Owned category modules contain the data adapter, normalization, navigation, rendering and SVG icon paths. Upstream card and playback code stays in charge of channel actions.

Preparation validates every managed path before writes, accepts repeat runs and known earlier overlays, refuses unknown customizations and rolls back incomplete writes. Do not delete those protections merely to make an upstream upgrade build: inspect the changed contract and update the adapter or checked patch.

## Build and verify

With Node 24 and npm 11:

```bash
BUILD_WEB=1 bash scripts/prepare-jellyfin-web.sh
```

Or build the already-prepared source in Docker:

```bash
sudo docker run --rm --user "$(id -u):$(id -g)" \
  -e NPM_CONFIG_CACHE=/tmp/npm-cache -v "$PWD/build/jellyfin-web-12.2:/src" -w /src \
  node:24-bookworm bash -lc 'npm ci && npm run build:production'
```

The output is `build/jellyfin-web-12.2/dist`. Before a release, run the upstream type, unit, lint, style and ES5 checks as well as browser tests; a production build alone is insufficient.

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

Scheduled compatibility checks cover stable server versions and the latest stable release; upstream master canaries detect drift without enabling an untested integration. A green canary is evidence to review, not an automatic compatibility declaration.

## Deployment and recovery

The catalog ZIP contains the DLL, independent-browser assets, full Web build and compatibility declaration. The startup filter serves the independent route first, then serves bundled Web only when the strict allowlist permits it. On older tested servers, a missing Web tree or an unknown server version, stock Web remains active.

Manual full-Web bind mounts are a development/recovery option only. Record the exact native asset directory or container mount, service identity and recoverable backup before changing deployment. Never copy into a guessed path. A read-only bind mount or custom image is preferable to copying files into a running container.

After deployment, restart and hard-refresh. Confirm:

1. Independent sign-in, category listing and bounded paging work under the configured BaseUrl.
2. Channel handoff uses normal Jellyfin and Back restores category/page/focus.
3. Sign-out clears the independent session; a 401 returns to login without stale channel content.
4. On 12.2.0, Programmes uses the category summaries while all other Live TV tabs remain unchanged.
5. Integrated channel logos, programme details, playback and recording actions remain stock Jellyfin behavior.
6. Owned category and paging/back controls show SVG icons, not font ligature names.
7. Failed category requests retain ordinary browsing; permission failures are not bypassed.

Physical LG/webOS acceptance testing is still required. ES5 checks and Chromium automation cannot guarantee behavior on every TV engine. Android TV/Fire TV and Swiftfin native screens need separate client work.
