# Proposed Architecture

## Source decision

Dispatcharr is the only IPTV-management layer required. Jellyfin consumes its standard outputs directly:

```text
Provider -> Dispatcharr `/output/m3u` + `/output/epg` -> Jellyfin -> clients
```

The unprofiled M3U contains 321 exact `group-title` values and the completed Jellyfin refresh contains 27,740 channels. A temporary threefold source count was corrected in Dispatcharr before the final verification. Xtream Library is not an architectural dependency.

The category browser never changes this media path. A channel selected from a category is still an ordinary Jellyfin `LiveTvChannel`, so playback, EPG, DVR, stream sharing and any Jellyfin transcoding decisions behave exactly as they do on the existing Channels page.

## Why a bridge is still required

A client-only implementation would require both:

1. a category summary without returning every channel; and
2. a server-side group filter that returns only a selected group's channels.

Jellyfin 10.11.11's M3U parser places `group-title` in tuner-side `ChannelInfo.ChannelGroup`, but that field is not persisted on `LiveTvChannel`. The public `/LiveTv/Channels` endpoint also has no group filter. Loading tens of thousands of channels in each browser is not acceptable.

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

- Display each Dispatcharr/Jellyfin group exactly as supplied for V1.
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

The bridge now:

- reuse Jellyfin's tuner cache rather than fetching the original IPTV provider;
- cache the derived index for five minutes;
- rebuild after expiry so Dispatcharr refreshes appear without a Jellyfin restart;
- replace snapshots atomically;
- avoid caching stream URLs or credentials;
- cache a visibility projection per Jellyfin user for the same snapshot;
- log only counts, never channel names, stream paths or provider details.

The first runtime smoke test will measure initial build time against the populated 10.11.11 tuner cache. A future task-completion hook can invalidate immediately after Refresh Guide if the five-minute bound is not sufficient.

## Authorization

Both category endpoints require Jellyfin authentication and the normal Live TV access policy. Browsing does not require administrator privileges. Responses never include `Path`, `MediaSources`, tuner settings, provider URLs, usernames, passwords or tokens.

## Web integration

The existing top-level Live TV tabs remain unchanged. Only Programmes tab content changes:

- show `All Channels` first and route it to the existing Channels experience;
- request and render all dynamic category summaries;
- on failure, show a short error and retain `All Channels`;
- on selection, request one page of that category's channels;
- pass returned DTOs to existing Jellyfin rendering and item-action code.

The source under `web/src` is the isolated data/rendering proof of concept. The production overlay is rebased onto the official Jellyfin Web `v10.11.11` tag and its preparation script verifies the two upstream source blob hashes before applying anything.

For release `0.2.0.0`, the catalog ZIP contains the complete built Web tree under `web/`. An ASP.NET Core startup filter registered by the plugin serves that directory at Jellyfin's normal `/web` request path before the stock static-file middleware. This turns the server API and matching Web client into one UI-installable unit while preserving the stock Web tree on disk. Missing bundled assets degrade to API-only mode.

The Web shell files are sent with no-cache headers, while fingerprinted assets are immutable. The package remains deliberately pinned to Server/Web `10.11.11`; a Jellyfin upgrade requires a new build and plugin release.

This integration affects only clients that load the server-hosted Web application. Native Android TV/Fire TV and Swiftfin clients can reuse the category API, but require separate category views and release cycles.
