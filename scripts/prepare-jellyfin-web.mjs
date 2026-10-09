import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = value => Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n'));
const blobHash = value => {
    const content = canonical(value);
    return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
};
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024, stdio: 'pipe' });

function safePath(base, relativePath) {
    if (!relativePath || relativePath.includes('\\') || path.posix.normalize(relativePath) !== relativePath
        || relativePath.startsWith('/') || relativePath.startsWith('../') || relativePath.includes(':')) {
        throw new Error(`Unsafe managed path: ${relativePath}`);
    }
    const resolved = path.resolve(base, relativePath);
    if (!resolved.startsWith(`${path.resolve(base)}${path.sep}`)) throw new Error(`Unsafe managed path: ${relativePath}`);
    return resolved;
}

async function noSymlinks(base, relativePath) {
    let current = path.resolve(base);
    for (const part of relativePath.split('/')) {
        current = path.join(current, part);
        try {
            if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing symbolic link: ${current}`);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
}

async function ownedFiles(base, relative = 'src') {
    const files = [];
    for (const entry of await readdir(safePath(base, relative), { withFileTypes: true })) {
        const name = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink()) throw new Error(`Refusing overlay symbolic link: ${name}`);
        if (entry.isDirectory()) files.push(...await ownedFiles(base, name));
        else if (entry.isFile()) files.push(name);
    }
    return files;
}

// All content, source fingerprints and target files are checked before the first write.
// A write failure rolls back every file already replaced; unknown edits are never overwritten.
export async function prepareSource({ sourceDir, overlayDir, metadata }) {
    if (metadata.schemaVersion !== 1) throw new Error('Unsupported compatibility metadata schema');
    const version = JSON.parse(await readFile(path.join(sourceDir, 'package.json'), 'utf8')).version;
    if (version !== metadata.serverWebVersion) throw new Error(`Refusing Jellyfin Web ${version}; expected ${metadata.serverWebVersion}`);
    const commit = git(sourceDir, ['rev-parse', 'HEAD']).toString().trim();
    if (commit !== metadata.commit) throw new Error(`Refusing Jellyfin Web commit ${commit}; expected ${metadata.commit}`);

    const stage = await mkdtemp(path.join(os.tmpdir(), 'ltvc-web-prepare-'));
    const desired = new Map();
    const originals = new Map();
    const written = [];
    try {
        for (const [relative, expected] of Object.entries(metadata.upstreamHashes)) {
            const content = git(sourceDir, ['show', `HEAD:${relative}`]);
            if (blobHash(content) !== expected) throw new Error(`Upstream fingerprint mismatch: ${relative}`);
            const staged = safePath(stage, relative);
            await mkdir(path.dirname(staged), { recursive: true });
            await writeFile(staged, content);
        }

        for (const patchName of metadata.patches) {
            const patchFile = safePath(overlayDir, patchName);
            const patch = await readFile(patchFile, 'utf8');
            const headers = [...patch.matchAll(/^(?:--- a\/|\+\+\+ b\/)([^\r\n]+)$/gm)].map(match => match[1]);
            if (!headers.length || headers.some(relative => !Object.hasOwn(metadata.upstreamHashes, relative))) {
                throw new Error(`Patch contains unmanaged paths: ${patchName}`);
            }
            git(stage, ['apply', '--check', '--whitespace=error', patchFile]);
            git(stage, ['apply', '--whitespace=error', patchFile]);
        }

        // The untouched legacy template is also checked/restored when migrating a known old overlay.
        for (const relative of Object.keys(metadata.upstreamHashes)) {
            desired.set(relative, await readFile(safePath(stage, relative)));
        }
        for (const relative of await ownedFiles(overlayDir)) {
            if (Object.hasOwn(metadata.upstreamHashes, relative)) {
                throw new Error(`An upstream file must be a checked patch, not an overlay: ${relative}`);
            }
            desired.set(relative, await readFile(safePath(overlayDir, relative)));
        }

        for (const [relative, content] of desired) {
            const target = safePath(sourceDir, relative);
            await noSymlinks(sourceDir, relative);
            let current;
            try { current = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            if (current) {
                const hash = blobHash(current);
                const known = [metadata.upstreamHashes[relative], blobHash(content), ...(metadata.previousOverlayHashes?.[relative] ?? [])];
                if (!known.includes(hash)) throw new Error(`Refusing to overwrite modified or unexpected file: ${relative}`);
            } else if (Object.hasOwn(metadata.upstreamHashes, relative)) {
                throw new Error(`Expected Jellyfin Web source file is missing: ${relative}`);
            }
            originals.set(relative, current);
        }

        for (const [relative, content] of desired) {
            if (originals.get(relative)?.equals(content)) continue;
            const target = safePath(sourceDir, relative);
            await mkdir(path.dirname(target), { recursive: true });
            const replacement = `${target}.ltvc-${randomUUID()}`;
            let replacementCreated = false;
            try {
                await writeFile(replacement, content, { flag: 'wx' });
                replacementCreated = true;
                await rename(replacement, target);
                written.push(relative);
            } finally {
                if (replacementCreated) await rm(replacement, { force: true });
            }
        }
        return { version, changedFiles: written.length, managedFiles: desired.size };
    } catch (error) {
        for (const relative of written.reverse()) {
            const target = safePath(sourceDir, relative);
            const original = originals.get(relative);
            if (original) await writeFile(target, original);
            else await rm(target, { force: true });
        }
        throw error;
    } finally {
        const resolvedStage = path.resolve(stage);
        if (path.dirname(resolvedStage) !== path.resolve(os.tmpdir())
            || !path.basename(resolvedStage).startsWith('ltvc-web-prepare-')) {
            throw new Error('Refusing to remove a directory outside the preparation scratch space');
        }
        await rm(resolvedStage, { recursive: true, force: true });
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const metadata = JSON.parse(await readFile(path.join(root, 'web/compatibility.json'), 'utf8'));
    if (process.argv[2] === '--metadata') {
        process.stdout.write([metadata.serverWebVersion, metadata.tag, metadata.releaseLine].join('\n') + '\n');
    } else {
        const sourceDir = path.resolve(process.argv[2]);
        try {
            const result = await prepareSource({ sourceDir, overlayDir: path.join(root, `web/patches/jellyfin-web-${metadata.releaseLine}`), metadata });
            console.log(`Prepared Jellyfin Web ${result.version}: ${result.changedFiles} changed, ${result.managedFiles} managed files`);
        } catch (error) {
            console.error(error.message);
            process.exitCode = 1;
        }
    }
}
