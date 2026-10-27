# Live TV Categories 0.8.0.0

Updates compatibility for Jellyfin 12.4 and rebuilds the bundled client from Jellyfin Web 12.4, including its SDK 1.0.2 dependency update.

- Enables integrated **Live TV → Programmes** browsing on explicitly tested Servers 12.2, 12.3 and 12.4.
- Keeps the same minimum-12.0 plugin DLL and independent browser across tested Servers 12.0–12.4.
- Reuses the checked category integration: upstream protected inputs and the server Live TV/authentication interfaces have not changed. Server 12.4 updates its .NET dependencies to 10.0.14.
- Retains SVG category controls for TVs, category/page/focus restoration after channel Back, and modern/TV browser coverage.
- Preserves Web build provenance checks, stable-release drift detection and all previous published catalog entries.

Update through the Jellyfin catalog, restart Jellyfin, then hard-refresh the browser. Use **Live TV → Programmes** on Server 12.2/12.3/12.4, or `/LiveTvCategories/ui/` (including any BaseUrl) on all five tested versions.

Future Jellyfin releases may change Web components, routing, SDK or server APIs and require another plugin update. Maintenance is best-effort; immediate support for every Jellyfin release is not guaranteed. Unknown versions remain guarded. Physical LG/webOS hardware still needs acceptance testing, and native Android TV, Fire TV and Swiftfin screens are unchanged.

The bundled client retains the official Web 12.4 dependency lock and inherited upstream advisories; compatibility checks are not a clean security audit. See the [upgrade checklist and dependency notes](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/blob/v0.8.0.0/docs/upgrade-checklist.md).
