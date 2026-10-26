import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSource, resolveOverlayDirectory } from './prepare-jellyfin-web.mjs';
import { latestRelease } from './upstream-releases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(path.join(root, 'web/compatibility.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm run test:upstream so the exact npm runtime is known');
const target = process.argv[2] ?? 'master';
if (!['master', 'latest-stable'].includes(target)) throw new Error('Canary target must be master or latest-stable');
const ref = target === 'master' ? 'master' : (await latestRelease('jellyfin-web')).tag_name;
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ltvc-upstream-web-'));
const candidateDirectory = path.join(temporaryRoot, 'jellyfin-web');
try {
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, 'https://github.com/jellyfin/jellyfin-web.git', candidateDirectory], { stdio: 'inherit' });
    const candidate = structuredClone(metadata);
    candidate.commit = execFileSync('git', ['-C', candidateDirectory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    candidate.serverWebVersion = JSON.parse(await readFile(path.join(candidateDirectory, 'package.json'), 'utf8')).version;
    for (const relative of Object.keys(candidate.upstreamHashes)) {
        const content = Buffer.from((await readFile(path.join(candidateDirectory, relative), 'utf8')).replace(/\r\n/g, '\n'));
        candidate.upstreamHashes[relative] = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
    }
    console.log(`CANARY ONLY (${target}): checking upstream ${candidate.serverWebVersion} at ${candidate.commit}; production compatibility metadata is not changed`);
    await prepareSource({ sourceDir: candidateDirectory, overlayDir: resolveOverlayDirectory(metadata, root), metadata: candidate });
    for (const args of [['ci'], ['run', 'build:check'], ['run', 'test'], ['run', 'lint'], ['run', 'stylelint'], ['run', 'build:production'], ['run', 'escheck']]) {
        execFileSync(process.execPath, [npmCli, ...args], { cwd: candidateDirectory, stdio: 'inherit' });
    }
} finally {
    const resolvedRoot = path.resolve(temporaryRoot);
    if (path.dirname(resolvedRoot) !== path.resolve(os.tmpdir()) || !path.basename(resolvedRoot).startsWith('ltvc-upstream-web-')) {
        throw new Error('Refusing to remove an unexpected canary directory');
    }
    await rm(resolvedRoot, { recursive: true, force: true });
}
