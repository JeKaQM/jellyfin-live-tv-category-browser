# Headless category-bridge development runbook

The bridge targets Jellyfin Server `10.11.11` exactly and builds with the .NET 9 SDK. It does not change the tuner, XMLTV, playback, transcoding or DVR path.

For normal installation, use the catalog package in `docs/catalog-installation.md`. The steps below are the manual API-only development path; copying only the DLL does not install the bundled Web client.

## 1. Build and test

From the repository root:

```bash
chmod +x scripts/build-plugin.sh
./scripts/build-plugin.sh
```

Expected output:

```text
artifacts/plugin/Jellyfin.Plugin.LiveTvCategories.dll
```

If `dotnet` is missing, install the `dotnet-sdk-9.0` package for the server's Linux distribution and rerun the script. Do not substitute .NET 8 for this Jellyfin 10.11.11 build.

If Docker is available, the host does not need a local SDK:

```bash
sudo docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp/dotnet-home -v "$PWD:/src" -w /src mcr.microsoft.com/dotnet/sdk:9.0 bash scripts/build-plugin.sh
```

## 2. Locate Jellyfin's plugin directory

Use the command matching the installation type.

Native package:

```bash
sudo find /var/lib/jellyfin /etc/jellyfin -maxdepth 3 -type d -name plugins -print 2>/dev/null
```

Docker or Podman:

```bash
sudo docker inspect jellyfin --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

For a container, use the host directory mounted at `/config`, followed by `/plugins`.

## 3. Install

Stop Jellyfin first, then create a dedicated versioned plugin directory and copy only the plugin DLL into it. Replace `/actual/jellyfin/plugins` below with the path found in step 2.

Native service:

```bash
PLUGIN_ROOT=/actual/jellyfin/plugins; sudo systemctl stop jellyfin && sudo install -d -o jellyfin -g jellyfin "$PLUGIN_ROOT/Live TV Categories_0.2.0.0" && sudo install -m 0644 -o jellyfin -g jellyfin artifacts/plugin/Jellyfin.Plugin.LiveTvCategories.dll "$PLUGIN_ROOT/Live TV Categories_0.2.0.0/" && sudo systemctl start jellyfin
```

Docker:

```bash
PLUGIN_ROOT=/actual/jellyfin/config/plugins; PLUGIN_DIR="$PLUGIN_ROOT/Live TV Categories_0.2.0.0"; JF_UID=$(sudo docker exec jellyfin id -u); JF_GID=$(sudo docker exec jellyfin id -g); sudo docker stop jellyfin && sudo install -d -m 0755 -o "$JF_UID" -g "$JF_GID" "$PLUGIN_DIR" && sudo install -m 0644 -o "$JF_UID" -g "$JF_GID" artifacts/plugin/Jellyfin.Plugin.LiveTvCategories.dll "$PLUGIN_DIR/" && sudo docker start jellyfin
```

The ownership step is required when the container runs as a non-root user: Jellyfin creates `meta.json` in the plugin directory during first startup.

## 4. Verify startup

Native service:

```bash
sudo journalctl -u jellyfin -b --no-pager | grep -iE 'Live TV Categories|LiveTvCategories|error'
```

Docker:

```bash
sudo docker logs jellyfin 2>&1 | grep -iE 'Live TV Categories|LiveTvCategories|error' | tail -n 100
```

Also confirm **Dashboard -> Plugins** lists `Live TV Categories` version `0.2.0.0` with no restart pending.

## 5. Smoke-test the API

This headless command asks for an administrator API key with hidden input, selects the first Live TV-enabled user, and prints only category counts. It does not print or store the key.

```bash
read -r -s -p 'Jellyfin API key: ' JF_KEY; echo; USERS=$(curl -fsS -H "X-Emby-Token: $JF_KEY" http://127.0.0.1:8096/Users) && USER_ID=$(python3 -c 'import json,sys; print(next((u["Id"] for u in json.load(sys.stdin) if u.get("Id") and (u.get("Policy") or {}).get("EnableLiveTvAccess",True)),""))' <<<"$USERS") && curl -fsS -H "X-Emby-Token: $JF_KEY" --get http://127.0.0.1:8096/LiveTvCategories --data-urlencode "userId=$USER_ID" | python3 -c 'import json,sys; x=json.load(sys.stdin); print("Categories: %d | Channels represented: %d" % (len(x),sum(c.get("channelCount",0) for c in x))); print(*("%s: %s" % (c["name"],c["channelCount"]) for c in x[:10]),sep="\n")'; unset JF_KEY USERS USER_ID
```

Expected first line:

```text
Categories: 321 | Channels represented: 27740
```

The first call may take longer because it builds the server-side index. Later calls within five minutes should use the cache.

## 6. Safety checks

- The category response must contain only `id`, `name` and `channelCount`.
- A category channel response must contain normal Jellyfin channel DTOs and must not contain tuner configuration or Dispatcharr/provider URLs.
- Clicking or requesting playback for a returned channel ID must follow the same Jellyfin route as the existing Channels page.
- If the plugin fails, remove only its versioned directory while Jellyfin is stopped, then start Jellyfin again. The native M3U tuner and guide remain unchanged.
