# Live TV Categories 0.7.0.1

Adds Jellyfin 12.3 support and closes the gap that allowed a successful backend check while integrated browsing was disabled after a server upgrade.

This revision includes the verified TV sign-in readiness fix in the release checks. The earlier 0.7.0.0 candidate was not published.

- Updates the bundled client to Jellyfin Web 12.3, including its upstream SDK and library-navigation fixes. Integrated Programmes browsing remains available on explicitly tested Servers 12.2 and 12.3.
- Keeps one minimum-12.0 plugin DLL and the independent browser across tested Servers 12.0–12.3.
- Checks latest stable Server/Web support separately from backend probes and upstream-master builds. An unsupported stable release now produces a visible failing check instead of a misleading all-green result.
- Uses shared, version-neutral integration code and metadata-driven build/test paths, avoiding copied overlays and hidden stale-version paths.
- Validates the built Web version, source commit and integration identity before packaging, preventing stale assets from being shipped as a newer client.
- Exercises modern and TV layouts for category paging, SVG controls, channel handoff and Back/focus restoration, including Jellyfin's Live TV tab preferences.
- Retains every previous catalog release without changing its download or checksum.

Update through the Jellyfin catalog, restart, then refresh your browser. Use **Live TV → Programmes** on Server 12.2/12.3, or `/LiveTvCategories/ui/` (including any BaseUrl) on all four tested versions.

Unknown future versions remain guarded; checks do not automatically enable or publish an untested integration. Physical LG/webOS hardware still needs acceptance testing. Native Android TV, Fire TV and Swiftfin screens are unchanged.

The bundled client retains the official Web 12.3 dependency lock and inherited upstream advisories; compatibility checks are not a clean security audit. See the [upgrade checklist and dependency notes](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/blob/v0.7.0.1/docs/upgrade-checklist.md).
