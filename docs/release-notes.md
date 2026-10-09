# Live TV Categories 0.6.0.0

This release makes category browsing less dependent on Jellyfin's changing Web internals.

- One plugin DLL, built against Jellyfin 12.0, tested unchanged on Server 12.0, 12.1 and 12.2.
- A new independent category browser at `/LiveTvCategories/ui/`, including your configured BaseUrl. Sign in with your normal Jellyfin account; channels open in normal Jellyfin for playback.
- Much smaller, checked Web integration patches. The bundled **Live TV → Programmes** view remains enabled only on Jellyfin 12.2; other tested versions keep stock Web.
- SVG category controls without icon-font dependencies, plus category/page/focus restoration when returning from a channel.
- Better tuner-failure recovery, fresh permission checks on every request, and authenticated compatibility reporting.
- Automated real-server/browser checks for stable releases and an upstream Web canary to catch changes early. Releases publish the exact runtime that passed those checks.

Install or update through the Jellyfin plugin catalog, restart Jellyfin, then refresh your browser. The catalog retains previous releases for their matching server versions.

Future Jellyfin versions are not automatically supported. Physical LG/webOS testing is still needed; automated browser and ES5 checks cannot guarantee every TV engine. Native Android TV, Fire TV and Swiftfin interfaces are unchanged.
