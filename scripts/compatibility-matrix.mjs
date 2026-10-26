import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestRelease, releaseVersion } from './upstream-releases.mjs';

export function serverMatrix(metadata, latestTag) {
    const versions = new Set(metadata.probeServerVersions);
    if (latestTag) versions.add(releaseVersion(latestTag));
    if (![...versions].every(version => /^\d+\.\d+\.\d+$/.test(version))) throw new Error('Invalid probe version metadata');
    return { include: [...versions].sort().map(serverVersion => ({
        serverVersion,
        basePath: serverVersion === '12.1.0' ? '/jellyfin' : ''
    })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const metadata = JSON.parse(await readFile(path.join(root, 'web/compatibility.json'), 'utf8'));
    const latestTag = process.env.GITHUB_TOKEN ? (await latestRelease('jellyfin')).tag_name : null;
    console.log(JSON.stringify(serverMatrix(metadata, latestTag)));
}
