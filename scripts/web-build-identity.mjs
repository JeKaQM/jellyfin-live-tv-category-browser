import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOverlayDirectory } from './prepare-jellyfin-web.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUILD_IDENTITY_FILE = 'live-tv-categories-build.json';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => value.toString('utf8').replace(/\r\n/g, '\n');

async function filesUnder(directory, relative = '') {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('Build inputs must not be symbolic links');
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Build inputs must not be symbolic links: ${name}`);
        if (entry.isDirectory()) files.push(...await filesUnder(target, name));
        else if (entry.isFile()) files.push({ name, target });
        else throw new Error(`Unsupported build input: ${name}`);
    }
    return files.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}

export async function webAssetHashes(distDir) {
    const result = Object.create(null);
    for (const { name, target } of await filesUnder(distDir)) {
        if (name !== BUILD_IDENTITY_FILE) result[name] = sha256(await readFile(target));
    }
    if (!Object.hasOwn(result, 'index.html')) throw new Error('The Web build has no index.html');
    return { ...result };
}

export async function describeWebBuild({ metadata, root = projectRoot }) {
    const overlayDir = resolveOverlayDirectory(metadata, root);
    const integration = Object.create(null);
    for (const { name, target } of await filesUnder(overlayDir)) integration[name] = sha256(canonical(await readFile(target)));
    return {
        schemaVersion: 1,
        serverWebVersion: metadata.serverWebVersion,
        sourceCommit: metadata.commit,
        integrationFingerprint: sha256(JSON.stringify(integration))
    };
}

export async function stampWebBuild({ sourceDir, distDir, metadata, root = projectRoot }) {
    const commit = execFileSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const sourceVersion = JSON.parse(await readFile(path.join(sourceDir, 'package.json'), 'utf8')).version;
    if (commit !== metadata.commit || sourceVersion !== metadata.serverWebVersion) {
        throw new Error('Refusing to stamp Web assets from an unexpected source version or commit');
    }
    // Preparation and compilation must use the same owned integration sources.
    const overlayDir = resolveOverlayDirectory(metadata, root);
    for (const { name, target } of await filesUnder(path.join(overlayDir, 'src'))) {
        const prepared = await readFile(path.join(sourceDir, 'src', name));
        if (canonical(prepared) !== canonical(await readFile(target))) throw new Error(`Web integration source is stale: src/${name}`);
    }
    const identity = { ...await describeWebBuild({ metadata, root }), assets: await webAssetHashes(distDir) };
    await writeFile(path.join(distDir, BUILD_IDENTITY_FILE), JSON.stringify(identity, null, 2) + '\n');
    return identity;
}

export async function verifyWebBuild({ distDir, metadata, root = projectRoot }) {
    let identity;
    try { identity = JSON.parse(await readFile(path.join(distDir, BUILD_IDENTITY_FILE), 'utf8')); }
    catch { throw new Error('Web build identity is missing or invalid; rebuild and stamp the pinned Web client'); }
    const expected = await describeWebBuild({ metadata, root });
    for (const [key, value] of Object.entries(expected)) {
        if (identity[key] !== value) throw new Error(`Web build identity mismatch: ${key}; refusing stale assets`);
    }
    const actualAssets = await webAssetHashes(distDir);
    if (JSON.stringify(identity.assets) !== JSON.stringify(actualAssets)) throw new Error('Web assets changed after their verified build was stamped');
    return identity;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const metadata = JSON.parse(await readFile(path.join(projectRoot, 'web/compatibility.json'), 'utf8'));
        if (process.argv[2] === 'stamp' && process.argv[3] && process.argv[4]) {
            const identity = await stampWebBuild({ sourceDir: path.resolve(process.argv[3]), distDir: path.resolve(process.argv[4]), metadata });
            console.log(`Stamped Jellyfin Web ${identity.serverWebVersion} at ${identity.sourceCommit}`);
        } else if (process.argv[2] === 'verify' && process.argv[3]) {
            const identity = await verifyWebBuild({ distDir: path.resolve(process.argv[3]), metadata });
            console.log(`Verified pinned Web build ${identity.serverWebVersion} and ${Object.keys(identity.assets).length} assets`);
        } else throw new Error('Usage: node scripts/web-build-identity.mjs stamp SOURCE DIST | verify DIST');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
