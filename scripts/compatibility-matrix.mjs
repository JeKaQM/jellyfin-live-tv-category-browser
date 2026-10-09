import { readFile } from 'node:fs/promises';

const metadata = JSON.parse(await readFile('web/compatibility.json', 'utf8'));
const versions = new Set(metadata.probeServerVersions);
if (process.env.GITHUB_TOKEN) {
    const response = await fetch('https://api.github.com/repos/jellyfin/jellyfin/releases/latest', {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(`Could not check latest upstream stable release: ${response.status}`);
    const release = await response.json();
    const match = /^v(\d+)\.(\d+)(?:\.(\d+))?$/.exec(release.tag_name);
    if (!match) throw new Error('Upstream release uses an unrecognized version format; review compatibility');
    versions.add(`${match[1]}.${match[2]}.${match[3] ?? '0'}`);
}
if (![...versions].every(version => /^\d+\.\d+\.\d+$/.test(version))) throw new Error('Invalid probe version metadata');
console.log(JSON.stringify({ include: [...versions].sort().map(serverVersion => ({
    serverVersion,
    basePath: serverVersion === '12.1.0' ? '/jellyfin' : ''
})) }));
