# Architecture

## Boundaries

Live TV Categories is an organizational layer over native Jellyfin M3U channels. Dispatcharr can provide M3U/XMLTV, but no particular IPTV manager is required.

```text
M3U group-title → native tuner cache → compatibility adapter
  → shared category metadata → current per-user visibility
  → category summary or bounded channel page
  → integrated cards OR independent browser → normal Jellyfin playback
```

Streams, transcoding, guide refresh, recording and DVR stay under Jellyfin's control. The repository's 27,740-channel/321-category fixture demonstrates scale, not an installation requirement.

## Server compatibility adapter

`JellyfinLiveTvCompatibilityAdapter` contains Jellyfin-dependent authorization, current-user lookup, tuner reads, native channel visibility and DTO conversion. The category index and grouping core depend on the small source/adapter interfaces, not tuner implementations.

M3U `group-title` becomes tuner-side `ChannelInfo.ChannelGroup`; it is not persisted as a group on `LiveTvChannel`, and the ordinary channel endpoint does not expose a group filter. The adapter matches cached tuner channel identifiers to persisted Jellyfin channels so the scan remains server-side.

The `0.7.0.1` DLL is built against the minimum tested `12.0.0` packages. Release checks run it unchanged on `12.0.0`, `12.1.0`, `12.2.0` and `12.3.0`. This is an explicit tested set, not a promise that a future Jellyfin ABI will load the DLL.

## Identity and pagination

Exact group values retain their original Unicode, punctuation and case. Null, empty or whitespace-only groups become `Uncategorised`. Exact duplicates are merged; channel IDs are deduplicated. Opaque deterministic SHA-256-based IDs include a type prefix so a real group named `Uncategorised` remains distinct from missing metadata.

`GET /LiveTvCategories` returns only `id`, `name` and `channelCount`. `GET /LiveTvCategories/{id}/Channels` uses `startIndex`, a default `limit` of 100 and a maximum of 250. It returns existing Jellyfin `BaseItemDto` channel records, optionally with current-program data.

## Cache and authorization

Only server-wide derived metadata is cached: normally five minutes, or a shorter retry window after partial tuner failure. Snapshots are atomically replaced under one build lock. Credentials, stream URLs and per-user visibility projections are not cached by this index.

Every request resolves the current user and Live TV permission, reads current native channel visibility before and after a potentially slow metadata build, and derives fresh counts. DTO conversion rechecks access and visibility again. User sessions cannot select a different user's category view; administrator API keys must supply an explicit Live TV-enabled `userId`.

A failed or internally timed-out tuner does not discard healthy tuner results. If all eligible sources fail, the API returns a sanitized, retryable 503 rather than an empty 200. Actual request cancellation remains cancellation. Logs and administrator diagnostics contain counts and states, not upstream exception details that might contain provider credentials.

An empty healthy source or an installation with no supported M3U tuners is a legitimate empty category result. Guide changes become visible after the native refresh and metadata-cache expiry; immediate task-completion invalidation is not currently implemented.

## Independent browser

The four owned assets under `web/standalone` are published as the sibling `category-browser/` directory. Startup serves `/LiveTvCategories/ui/` before deciding whether bundled Jellyfin Web is compatible. The path includes a configured BaseUrl. `/LiveTvCategories/ui` redirects to its trailing-slash form so relative assets resolve correctly.

The independent browser has no Jellyfin Web imports, external font dependency or media player. Its dependency-free scripts are ES5-compatible. Category and channel text uses DOM text nodes; SVG paths are owned static data. The page signs in a normal user through the public authentication API and modern `Authorization: MediaBrowser ... Token="..."` header. Passwords are never persisted; its token is kept only in memory or its own tab-scoped session storage.

Category channels and All channels are bounded to 100 per page. A tiny URL adapter opens standard Jellyfin channel details, leaving playback to stock Web. Stock Web may require a separate sign-in. Browser Back restores the previous category, page and channel focus; sign-out clears only this page's session and best-effort revokes its own token.

Static assets use no-store cache headers and a restrictive same-origin content security policy. Expired sessions return to login; permission failures never bypass server access checks. Category errors or an unsupported category contract retain the ordinary All channels and normal-Jellyfin fallback.

## Minimal Web integration

Only the Programmes content is replaced in Jellyfin Web `12.3.0`; the other top-level Live TV tabs and existing card/playback actions stay intact. Two small checked hooks connect upstream `livetvsuggested.js` and `PageTabContent.tsx` to owned category modules in version-neutral `web/integration/`. Upstream legacy HTML is unchanged. The protected inputs did not change from Web 12.2 to 12.3, so the integration hooks were reused without copying an entire new overlay.

Owned modules isolate API calls, normalization, paging, navigation and SVG controls. Modern navigation records category/page state in the URL; legacy controllers preserve equivalent in-page state. Both restore category, page and focus after channel details.

`web/compatibility.json` is the central declaration for the exact tag/commit, integration source directory, protected source hashes, target ABI and explicit server allowlist. Preparation verifies all managed input before writes, supports repeat runs and known prior overlays, rolls back incomplete writes and refuses unknown customizations. Build provenance ties the compiled Web output to this declaration and integration source; packaging rejects missing or mismatched provenance instead of trusting any `index.html` directory.

Catalog ZIPs still include the complete pinned Web build under `web/` for seamless integration on the tested Server 12.2/12.3 combinations. Jellyfin treats catalog `targetAbi` as a minimum, so a separate strict startup guard prevents this full client from being served on `12.0.0`, `12.1.0` or an unknown version. Missing Web files also leave stock Web active. The independent browser remains separate from that guard.

## Health and continuous checks

`GET /LiveTvCategories/Compatibility` requires Live TV authentication and returns the API contract, safe adapter state and integration compatibility. `/Diagnostics` additionally requires administrator elevation and exposes count-only source details.

Compatibility CI tests declared stable servers and the latest stable release with the same minimum-ABI DLL, real M3U fixture and browser flows. A separate stable-release declaration check fails when a new Server/Web release is not covered, even if the guarded fallback and backend probes still pass. Latest-stable and master canaries detect Web drift without promoting a version to the support allowlist. Modern and TV layout checks cover the integrated UI, not only the independent page. Web compilation, checked-patch preparation, browser interactions, permissions, provenance, packaging and ES5 checks complement server tests.

Automated checks do not substitute for physical LG/webOS testing. Native Android TV/Fire TV and Swiftfin clients need their own category implementation; this plugin does not replace their interfaces.
