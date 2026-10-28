# Live TV Categories 0.9.0.1

Adds a user-controlled override for the bundled interface's Jellyfin version restriction.

Open **Dashboard → Plugins → Live TV Categories** and enable **Allow bundled interface on untested Jellyfin versions** after reading its warning. Save and hard-refresh; no server restart is needed to change the setting. It is off by default, persists across restarts and upgrades, and can be switched off again without restarting.

**Warning:** the override affects everyone using this server's hosted Web client. It serves the plugin's entire bundled Jellyfin Web interface, which may have older dependencies or lack newer Web fixes. Untested combinations can break login, playback, recording controls or the dashboard. The override does not repair server API incompatibilities or a plugin that Jellyfin cannot load, and it does not declare the version tested.

- Uses Jellyfin's standard administrator-only plugin configuration API and preserves existing configuration fields when saving.
- Reports saved and actually active override states separately, without changing tested version lists.
- Keeps missing Web assets and invalid compatibility metadata blocked even when the toggle is enabled.
- Updates the legacy client adapter to use Jellyfin's existing connection accessor.
- Checks the real settings page, live enable/disable, saved opt-in after a restart, and non-administrator save rejection on an isolated server.
- Retains the Web 12.4 / SDK 1.0.2 bundle, TV SVG controls, paging and category Back/focus fixes. Default tested support remains Servers 12.0–12.4 for the backend/independent page and 12.2/12.3/12.4 for integration.

Install through the catalog, restart once for the plugin update, then refresh your browser. Subsequent toggle changes apply without restarting. If the dashboard becomes unusable after an override, follow the [configuration-file recovery instructions](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/blob/v0.9.0.1/docs/catalog-installation.md#version-override-and-recovery).

Maintenance remains best-effort. Enabling the override cannot guarantee future Jellyfin compatibility. Physical LG/webOS hardware still needs acceptance testing. The bundled client retains inherited upstream dependency advisories; see the [upgrade checklist](https://github.com/JeKaQM/jellyfin-live-tv-category-browser/blob/v0.9.0.1/docs/upgrade-checklist.md).
