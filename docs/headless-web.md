# Jellyfin Web integration and independent browser

Plugin `0.9.0.0` has two interfaces:

- The independent page at `/LiveTvCategories/ui/` works with the tested backend on Jellyfin `12.0.0`, `12.1.0`, `12.2.0`, `12.3.0` and `12.4.0` without replacing stock Web.
- The bundled **Live TV → Programmes** integration is built from Jellyfin Web `12.4.0` and defaults to explicitly tested Server `12.2.0`, `12.3.0` and `12.4.0`. The warned administrator setting can permit other versions without expanding tested support.

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

`web/compatibility.json` declares the current exact tag, commit, protected hashes, owned integration directory and allowlist. The preparer clones `v12.4` at `0a580ce8df89282dfd120b6d5efb8e106da23bd5` into `build/jellyfin-web-12.4`, or checks the checkout supplied through `JELLYFIN_WEB_SOURCE`.

The single owned integration source lives under `web/integration/`, independent of the upstream release number. Small upstream releases no longer require duplicating and renaming the category modules. Historical metadata without `overlayDirectory` still resolves its older versioned directory; metadata paths cannot escape the repository.

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
  -e NPM_CONFIG_CACHE=/tmp/npm-cache -v "$PWD/build/jellyfin-web-12.4:/src" -w /src \
  node:24-bookworm bash -lc 'npm ci && npm run build:production'
```

The output is `build/jellyfin-web-12.4/dist`. Before a release, run the upstream type, unit, lint, style and ES5 checks as well as browser tests; a production build alone is insufficient.

`BUILD_WEB=1` stamps the successful build with its checked source and compatibility identity. After a raw npm or Docker build, stamp it explicitly from the project root:

```bash
node scripts/web-build-identity.mjs stamp build/jellyfin-web-12.4 build/jellyfin-web-12.4/dist
```

The catalog builder verifies this identity, not just the presence of `index.html`. It refuses stale output from a previous Jellyfin release or an unprepared source checkout. Rebuild and restamp after changing owned integration modules; copying an old stamp onto different assets is not a valid release build.

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

Scheduled compatibility checks cover stable server versions and the latest stable release; upstream master canaries detect drift without enabling an untested integration. A green canary is evidence to review, not an automatic compatibility declaration.

## What changed in Jellyfin 12.4

Web 12.4 updates `@jellyfin/sdk` from 1.0.1 to 1.0.2 and retains the same protected integration inputs as Web 12.3. The shared category hooks therefore need no rewrite. Build from the new upstream dependency lock and verify it; reusing an old compiled Web directory would omit the SDK update even if the category screen appeared to work.

Server 12.4 updates its .NET dependencies to 10.0.14 without changing the Live TV or authentication interfaces used here. The plugin keeps the minimum-12.0 API build and adds 12.4 only to the explicitly tested server declarations. Future dependency-only releases still require review, an actual rebuild and runtime checks before widening the allowlist.

## Earlier 12.3 navigation changes

The two patched upstream files and protected legacy template are byte-identical to 12.2, so the checked integration hooks did not need rewriting. Jellyfin Web updates its SDK to 1.0.1 and adjusts library-title lookup, played-state refresh and remembered-tab lookup. In particular, remembered Live TV tabs now use the `collectionType=livetv` query parameter; retain that parameter when constructing a Live TV route and use `tab=0` for an explicit Programmes entry.

The previous exact-version guard intentionally kept the 12.2 bundle disabled on 12.3. That protected stock Web but could look like lost integration even when the category API remained compatible. Stable-release drift checks must report this integration support gap separately from backend/API test success. Adding a version to the allowlist still requires real-server and integrated-browser verification.

## Deployment and recovery

The catalog ZIP contains the DLL, independent-browser assets, full Web build and compatibility declaration. The startup filter serves the independent route first. Its per-request bundled-Web policy allows declared versions, or an explicit saved administrator override. Without the override, other versions keep stock Web. Missing Web assets or invalid compatibility metadata still keep stock Web even with the override enabled.

The plugin settings page is an embedded Jellyfin configuration page and uses Jellyfin's administrator configuration API. Saving `AllowUntestedServerVersions` takes effect without a restart; hard-refresh existing clients when switching. Compatibility reporting distinguishes the saved preference from an override that is actually active. See [override risks and recovery](catalog-installation.md#version-override-and-recovery).

Manual full-Web bind mounts are a development/recovery option only. Record the exact native asset directory or container mount, service identity and recoverable backup before changing deployment. Never copy into a guessed path. A read-only bind mount or custom image is preferable to copying files into a running container.

After deployment, restart and hard-refresh. Confirm:

1. Independent sign-in, category listing and bounded paging work under the configured BaseUrl.
2. Channel handoff uses normal Jellyfin and Back restores category/page/focus.
3. Sign-out clears the independent session; a 401 returns to login without stale channel content.
4. On 12.2.0, 12.3.0 and 12.4.0, Programmes uses the category summaries while all other Live TV tabs remain unchanged.
5. Integrated channel logos, programme details, playback and recording actions remain stock Jellyfin behavior.
6. Owned category and paging/back controls show SVG icons, not font ligature names.
7. Failed category requests retain ordinary browsing; permission failures are not bypassed.

Physical LG/webOS acceptance testing is still required. ES5 checks and Chromium automation cannot guarantee behavior on every TV engine. Android TV/Fire TV and Swiftfin native screens need separate client work.
