import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStableSupport, latestRelease } from './upstream-releases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
    const metadata = JSON.parse(await readFile(path.join(root, 'web/compatibility.json'), 'utf8'));
    const [server, web] = await Promise.all([latestRelease('jellyfin'), latestRelease('jellyfin-web')]);
    const versions = assertStableSupport(metadata, server, web);
    console.log(`Latest stable Server ${versions.serverVersion} and Web ${versions.webVersion} are explicitly declared; no support was widened`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
