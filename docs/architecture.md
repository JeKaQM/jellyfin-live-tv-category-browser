# Architecture

## Source decision

Jellyfin consumes standard M3U and XMLTV inputs directly. Dispatcharr can provide those outputs, but the category browser does not require a specific IPTV-management application:

```text
Provider or M3U/XMLTV manager -> M3U + XMLTV -> Jellyfin -> clients
```

The repository's large-scale validation fixture contains 321 exact `group-title` values and 27,740 channels. Those numbers demonstrate scale rather than define an installation requirement; production counts depend on the configured tuner. Xtream Library is not an architectural dependency.

The category browser never changes this media path. A channel selected from a category is still an ordinary Jellyfin `LiveTvChannel`, so playback, EPG, DVR, stream sharing and any Jellyfin transcoding decisions behave exactly as they do on the existing Channels page.

## Why a bridge is still required

A client-only implementation would require both:

1. a category summary without returning every channel; and
2. a server-side group filter that returns only a selected group's channels.

Jellyfin's M3U parser places `group-title` in tuner-side `ChannelInfo.ChannelGroup`, but that field is not persisted on `LiveTvChannel`. The public `/LiveTv/Channels` endpoint also has no group filter. Loading tens of thousands of channels in each browser is not acceptable. The bridge is rebuilt against each supported Jellyfin ABI: plugin `0.3.0.0` targets Jellyfin `12.0.0`, while plugin `0.2.0.0` remains pinned to Jellyfin `10.11.11`.

The minimal category bridge is therefore:

```text
Jellyfin M3U tuner ChannelInfo cache
  -> short-lived category index
  -> category summary endpoint
  -> selected-category endpoint
  -> existing LiveTvChannel BaseItemDto
  -> existing Jellyfin cards, playback and DVR actions
```

It is an organizational layer only. It does not handle stream URLs, proxy traffic, transcode media, store IPTV credentials or call the original provider.

## Category identity

- Display each source/Jellyfin group exactly as supplied.
- Treat null, empty and whitespace-only values as `Uncategorised`.
- Use an opaque, deterministic SHA-256-based ID derived from a type prefix plus the exact group value.
- Never place a raw group name directly in the route.
- Merge exact duplicates while preserving Unicode, punctuation and case.

## Initial request

`GET /LiveTvCategories` returns only `id`, `name` and `channelCount`. Even with 321 categories this is a small response and contains no channel cards or stream information.

The server builds the index from the existing tuner cache. The full channel scan remains server-side, is cached, and is not repeated by every browser or represented in the page DOM.

## Category request

`GET /LiveTvCategories/{id}/Channels` accepts `startIndex` and `limit` and returns only the requested page. The bridge maps tuner identifiers to Jellyfin's existing `LiveTvChannel` items and returns normal `BaseItemDto` records with current-program data where supported.

The web client passes those DTOs to Jellyfin's existing channel-card and item-action code. This preserves logos, EPG, playback and recording actions.

## Cache behavior

The bridge:

- reuses Jellyfin's tuner cache rather than fetching the original IPTV provider;
- cache the derived index for five minutes;
- rebuild after expiry so Dispatcharr refreshes appear without a Jellyfin restart;
- replace snapshots atomically;
- avoid caching stream URLs or credentials;
- cache a visibility projection per Jellyfin user for the same snapshot;
- log only counts, never channel names, stream paths or provider details.

Runtime and scale tests cover a populated 27,740-channel, 321-category tuner fixture. A future task-completion hook can invalidate immediately after Refresh Guide if the five-minute bound is not sufficient.

## Authorization

Both category endpoints require Jellyfin authentication and the normal Live TV access policy. Browsing does not require administrator privileges. Responses never include `Path`, `MediaSources`, tuner settings, provider URLs, usernames, passwords or tokens.

## Web integration

The existing top-level Live TV tabs remain unchanged. Only Programmes tab content changes:

- show `All Channels` first and route it to the existing Channels experience;
- request and render all dynamic category summaries;
- on failure, show a short error and retain `All Channels`;
- on selection, request one page of that category's channels;
- pass returned DTOs to existing Jellyfin rendering and item-action code.

Jellyfin Web 12 has both a modern Live TV route and a legacy controller used by older layouts and TV clients. The `0.3.0.0` overlay integrates the category browser with both paths. Modern navigation records the selected category and page in the URL. The legacy path retains the same state in its page controller. Returning from channel details therefore restores the selected category, channel page, and focus instead of dropping back to the category landing page or leaving Live TV.

Category icons avoid ligature text in the legacy TV path, so older LG webOS browser engines do not display icon names or clipped glyphs. The modern view uses Jellyfin's normal vector icon components. Both paths retain visible remote-control and keyboard focus styles.

The source under `web/src` is the isolated data/rendering proof of concept. The `0.3.0.0` production overlay is rebased onto the official Jellyfin Web `v12.0` tag; the preparation script verifies the exact upstream commit and protected source hashes before applying it. The `v0.2.0.0` source and release remain the corresponding Jellyfin Web `v10.11.11` implementation.

Each catalog ZIP contains the complete version-matched Web tree under `web/`. An ASP.NET Core startup filter registered by the plugin serves that directory at Jellyfin's normal `/web` request path before the stock static-file middleware. This turns the server API and matching Web client into one UI-installable unit while preserving the stock Web tree on disk. Jellyfin interprets catalog `targetAbi` as a minimum version, so the startup filter separately requires the exact server version before serving the pinned Web tree. Missing assets or a version mismatch degrade to API-only mode.

Web shell files are sent with no-cache headers, while fingerprinted assets are immutable. Every package remains deliberately pinned to its matching Server/Web version. A Jellyfin upgrade across these version lines requires the matching plugin release rather than reusing the previous Web build.

This integration affects only clients that load the server-hosted Web application. Native Android TV/Fire TV and Swiftfin clients can reuse the category API, but require separate category views and release cycles.
