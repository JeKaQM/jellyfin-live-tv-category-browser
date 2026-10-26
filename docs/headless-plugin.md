# Headless category-bridge development

Plugin `0.7.0.1` builds with .NET 10 against the minimum tested Jellyfin `12.0.0` packages. Release checks run the same DLL on `12.0.0`, `12.1.0`, `12.2.0` and `12.3.0`. Future ABI compatibility is not guaranteed.

For production, use the [catalog package](catalog-installation.md). A DLL-only manual install supplies the API; adding the published `category-browser/` directory also supplies the independent screen. Full Programmes integration additionally needs the pinned `web/` tree and is enabled only on explicitly tested Servers `12.2.0` and `12.3.0`.

## Build

```bash
bash scripts/build-plugin.sh
```

Published output includes:

```text
artifacts/plugin/Jellyfin.Plugin.LiveTvCategories.dll
artifacts/plugin/category-browser/index.html
artifacts/plugin/category-browser/browser-core.js
artifacts/plugin/category-browser/app.js
artifacts/plugin/category-browser/app.css
```

Install the .NET 10 SDK on the build host or use Docker:

```bash
sudo docker run --rm --user "$(id -u):$(id -g)" \
  -e DOTNET_CLI_HOME=/tmp/dotnet-home -e NUGET_PACKAGES=/tmp/dotnet-home/.nuget/packages \
  -v "$PWD:/src" -w /src mcr.microsoft.com/dotnet/sdk:10.0 \
  bash scripts/build-plugin.sh
```

`JellyfinApiVersion` is an explicit development override for source-compatibility probes, not permission to ship an untested ABI. The default minimum-version build is the artifact used for cross-version runtime testing.

## Manual installation

Locate the native plugin directory from Jellyfin's configured data directory, or inspect the container mount that supplies `/config`; its plugins directory is normally `/config/plugins` inside the container. Do not copy into a guessed system path.

Stop Jellyfin. Create a dedicated `Live TV Categories_0.7.0.1` directory under the actual plugin root, copy the DLL and `category-browser/` from `artifacts/plugin`, and give the Jellyfin service/container user access to that directory. Jellyfin must be able to create `meta.json` on first startup. Disable earlier copies of the same plugin, then restart.

Do not manually overwrite stock Jellyfin Web. Omitting `web/` deliberately leaves it active. Browse the independent page at `/LiveTvCategories/ui/`, including the server's configured BaseUrl.

Verify **Dashboard → Plugins** shows version `0.7.0.1` without a restart pending. Logs should identify the plugin and independent-browser route; a bundled-Web mismatch warning on 12.0 or 12.1 is expected.

## API smoke test

This local example prompts for an administrator API key using hidden input, selects a Live TV-enabled user and prints only counts. Ordinary browsing uses normal user sessions; never enter an administrator API key into the browser page.

```bash
read -r -s -p 'Jellyfin API key: ' JF_KEY; echo
USERS=$(curl -fsS -H "Authorization: MediaBrowser Token=\"$JF_KEY\"" http://127.0.0.1:8096/Users)
USER_ID=$(python3 -c 'import json,sys; print(next((u["Id"] for u in json.load(sys.stdin) if u.get("Id") and (u.get("Policy") or {}).get("EnableLiveTvAccess",True)),""))' <<<"$USERS")
if [ -n "$USER_ID" ]; then
  curl -fsS -H "Authorization: MediaBrowser Token=\"$JF_KEY\"" --get \
    http://127.0.0.1:8096/LiveTvCategories --data-urlencode "userId=$USER_ID" | \
    python3 -c 'import json,sys; x=json.load(sys.stdin); print("Categories: %d | Channels represented: %d" % (len(x),sum(c.get("channelCount",0) for c in x)))'
else
  echo 'No Live TV-enabled user was found.' >&2
fi
unset JF_KEY USERS USER_ID
```

Adjust the origin and BaseUrl for the actual server. Use HTTPS for remote credentials. The initial metadata build may take longer; later requests share metadata but still recheck current user permissions and visibility.

## Real-server and browser checks

The Windows smoke harness starts an isolated official Jellyfin server with temporary accounts and an M3U fixture, checks authentication, ordinary-user access, administrator diagnostics, paging and cached-permission revocation, then exercises actual browser sign-in, channel handoff, Back/focus and sign-out. On integrated versions it also checks modern and TV layouts, page-two restoration and SVG category controls.

```powershell
npm ci
npx playwright install chromium
./scripts/smoke-server.ps1 -ServerVersion 12.3.0
./scripts/smoke-server.ps1 -ServerVersion 12.2.0
./scripts/smoke-server.ps1 -ServerVersion 12.1.0 -BasePath /jellyfin
./scripts/smoke-server.ps1 -ServerVersion 12.0.0
```

Use the same minimum-ABI plugin output for all four runs. The harness uses a fresh isolated data directory and stops only the server it starts. It does not modify a production Jellyfin installation.

## Health and failure handling

`/LiveTvCategories/Compatibility` requires Live TV authentication and exposes the contract and safe integration state. `/LiveTvCategories/Diagnostics` additionally requires administrator elevation and contains source counts, not URLs or credentials.

Per-user visibility is never stored in the shared cache. Healthy tuner categories remain available when another tuner fails or internally times out. If all sources fail, a sanitized 503 with retry guidance is returned; actual request cancellation propagates normally.

On failure, keep normal Jellyfin available rather than bypassing authorization or forcing an untested bundled Web client. Remove or disable only this plugin while Jellyfin is stopped; tuner and guide configuration remains unchanged.
