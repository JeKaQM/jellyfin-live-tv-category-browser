# Jellyfin upgrade checklist

Compatibility has three separate meanings: the DLL loads and its API works, the independent page works, and the integrated Web view works. A successful backend probe alone does not establish the third.

## User-controlled version override in 0.9

The default Web version restriction remains unchanged. Administrators can explicitly choose `AllowUntestedServerVersions` in the plugin settings after reading the warning. It permits the bundled interface on other versions without adding them to tested support. The preference persists, applies per request without a restart, and affects all users of the hosted Web interface. A missing bundle, invalid metadata or a server that cannot load the plugin is outside this override.

The compatibility response distinguishes the saved preference (`bundledWebVersionOverrideEnabled`) from an override actually being used (`bundledWebVersionOverrideActive`). On a tested server the preference can be enabled while the active flag remains false. Keep scheduled drift checks and explicit version declarations: an override is a user's risk decision, not a substitute for compatibility maintenance. Real-server checks exercise the admin settings page, on/off transitions, persistence and rejected non-admin writes.

## Upcoming Web API context migration

Upstream Web master commit `4c23d9728ea8566337ed0b7ff29dd658b06e86e5`
removes `__legacyApiClient__` from `useApi` and exposes a `serverId` derived
from `user.ServerId` instead. The category channel cards now use
`user.ServerId` directly, a field shared by stable Web 12.4 and master, and
refresh their memoized options when that identity changes. Executable view
regressions cover card identity without a legacy client, server changes and
missing identity; stable and master type/build checks remain required.
This adaptation does not change the pinned bundle or supported versions.

## What changed in 12.4

Jellyfin [Server 12.4](https://github.com/jellyfin/jellyfin/releases/tag/v12.4) and [Web 12.4](https://github.com/jellyfin/jellyfin-web/releases/tag/v12.4) were released on 26 October 2026. Server updates its .NET dependencies to 10.0.14; Web updates `@jellyfin/sdk` from 1.0.1 to 1.0.2. The server changes do not alter this plugin's Live TV/authentication interfaces, and all three protected Web inputs remain unchanged. The shared integration can be reused, but the compiled Web client must be rebuilt from the new source and lockfile to include the dependency update.

Version 0.8 retains the minimum-12.0 API build, adds Server 12.4 to the backend and integrated-browser test sets, and bundles Web 12.4. The existing drift check correctly reports a new stable release as unsupported until its declarations are reviewed. A dependency-only upstream change is not permission to skip the fresh build, provenance verification, modern/TV browser checks or older-server regression runs.

## Earlier 12.3 changes

Jellyfin [Server 12.3](https://github.com/jellyfin/jellyfin/releases/tag/v12.3) and [Web 12.3](https://github.com/jellyfin/jellyfin-web/releases/tag/v12.3) were released on 23 October 2026. The server changes did not alter this plugin's Live TV/authentication interfaces. The three protected integration inputs were unchanged. Web updated its SDK to 1.0.1 and changed library titles, played-state refresh and remembered Live TV tabs; routes should retain `collectionType=livetv` and use `tab=0` for an explicit Programmes entry.

The old guard correctly left stock Web active on an untested version, but the scheduled backend test could still be green. Version 0.7 separates this support gap into a failing stable-release declaration check. It also removes version-specific integration copies, derives build/test paths from metadata, validates compiled asset identity, and tests both modern and TV navigation.

## For the next release

1. Read the official Server and Web release notes and compare their tags with the last pinned commits. Check Live TV, authentication, SDK, routing, caching and minimum runtime changes independently.
2. Keep `serverApiVersion` at the oldest compatible, runtime-tested ABI. Do not raise it just because a newer server exists. Update `web/compatibility.json` only after reviewing the new Web tag/commit and protected input hashes; reuse `web/integration/` when the hooks remain valid.
3. Prepare the pinned source transactionally. Investigate a refused patch or changed fingerprint; never disable the checks to force an upgrade. Run upstream type, unit, lint, style, production-build and ES5 checks.
4. Stamp the compiled output with `scripts/web-build-identity.mjs`. Its source version, commit, integration fingerprint and asset hashes must match at packaging time. Do not stamp an old distribution as a new build.
5. Run the same minimum-ABI DLL on every declared server, including a configured BaseUrl. Check authenticated APIs, normal-user permissions, revocation after caching, independent-page sign-in, paging, channel handoff and sign-out.
6. For every proposed integrated server, run both modern and TV layouts against the actual Web build. Check Programmes versus remembered tabs, page-two channel Back/focus, category Back/focus and SVG controls. Physical LG/webOS testing remains a separate acceptance step.
7. Add versions to the exact Web allowlist only after those checks pass. Keep unknown versions guarded by default and leave the override off in normal tests. Test override behavior separately without changing the tested list. A green latest-stable/master canary does not automatically widen support or authorize a release.
8. Preserve published catalog entries unchanged in `web/catalog-history.json`, bump the plugin version and update release notes. Tag only the reviewed commit. The release must publish the exact runtime tested by CI, not an untested rebuild.

## Dependency advisories are separate from compatibility

The Web bundle retains the official 12.4 dependency lock, including its SDK 1.0.2 update. An audit is not clean merely because compilation and browser checks pass. The earlier 12.3 review found inherited advisories, including build/install-only `tar` dependencies and browser libraries; advisory severity alone does not establish browser reachability. Updating the Jellyfin pin does not by itself resolve those findings or establish that every dependency is safe.

For example, upstream PDF loading explicitly uses `isEvalSupported: false`, the documented mitigation for [the PDF.js advisory](https://github.com/advisories/GHSA-wgrm-67xf-hhpq). The audited optional native-canvas installer chain is not part of the browser bundle. Other findings, including [markdown rendering denial of service](https://github.com/advisories/GHSA-gfr2-rv44-r23c), still require upstream dependency maintenance; this release does not claim to fix every upstream advisory. The independent category page has no third-party runtime dependencies.

Review audit output during upgrades. Prefer upstream patched releases or narrowly reviewed, tested dependency changes; do not apply a forced major-version dependency rewrite and assume TV compatibility is unchanged. Avoid exposing untrusted media metadata or documents to users without considering these upstream risks.
