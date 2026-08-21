# Headless Dispatcharr-to-Jellyfin Setup

## Prerequisites

- Jellyfin can reach your Dispatcharr instance (for example `http://127.0.0.1:9191` when both run on the same host).
- Dispatcharr exposes `/output/m3u` and `/output/epg`.
- You have a Jellyfin administrator API key.
- `curl`, `python3` and Bash are installed.

Do not paste the API key into chat or put it directly on a command line.

## Configure

Run from the project directory:

```bash
chmod +x scripts/configure-dispatcharr-jellyfin.sh
./scripts/configure-dispatcharr-jellyfin.sh
```

The API-key prompt is hidden. With 27,740 channels, the Jellyfin guide refresh can take several minutes. The default wait is 15 minutes; use a longer limit if needed:

```bash
JELLYFIN_WAIT_SECONDS=3600 ./scripts/configure-dispatcharr-jellyfin.sh
```

The script returns:

- `0` when channels become visible;
- `1` for validation/configuration errors; or
- `2` when the tuner and guide were saved but channels did not become visible before the wait ended.

Exit code `2` does not remove the configuration. Check the refresh task and rerun the same script; it will not add duplicates.

## Verify without a browser

Enter the key once into a hidden shell variable:

```bash
read -r -s -p 'Jellyfin API key: ' JF_KEY; echo
```

Check the Refresh Guide task:

```bash
curl -fsS \
  -H "X-Emby-Token: $JF_KEY" \
  http://127.0.0.1:8096/ScheduledTasks \
| python3 -c 'import json,sys
for task in json.load(sys.stdin):
    if "refresh guide" in task.get("Name", "").lower():
        print(task.get("Name"), task.get("State"), task.get("CurrentProgressPercentage"))'
```

Check Jellyfin's published channel count:

```bash
curl -fsS \
  -H "X-Emby-Token: $JF_KEY" \
  'http://127.0.0.1:8096/LiveTv/Channels?StartIndex=0&Limit=1&AddCurrentProgram=false' \
| python3 -c 'import json,sys; print(json.load(sys.stdin).get("TotalRecordCount", 0))'
```

Clear the shell variable when finished:

```bash
unset JF_KEY
```

## Common outcomes

### XMLTV check fails

Confirm the endpoint from the Jellyfin host:

```bash
curl -fsSI --max-time 120 http://127.0.0.1:9191/output/epg
```

### Refresh exceeds 15 minutes

Let the scheduled task finish, then rerun with a longer wait. Matching entries are detected and retained.

### Count differs from 27,740

The guide may still be refreshing, or Jellyfin may merge/filter entries with duplicate channel identities. Wait for the task to become `Idle`, then check the count again.

### Xtream warning appears

That warning is expected during migration. First verify a Dispatcharr-imported channel plays and has guide data. Only then disable or uninstall Xtream Library so it cannot later create a duplicate tuner/channel set.
