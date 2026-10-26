import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BUILD_IDENTITY_FILE, stampWebBuild, verifyWebBuild } from '../web-build-identity.mjs';

async function fixture(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ltvc-identity-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const sourceDir = path.join(root, 'source');
    const distDir = path.join(root, 'dist');
    await mkdir(path.join(root, 'web/integration/src'), { recursive: true });
    await mkdir(path.join(sourceDir, 'src'), { recursive: true });
    await mkdir(distDir);
    await writeFile(path.join(root, 'web/integration/src/owned.js'), 'var category = true;\n');
    await writeFile(path.join(sourceDir, 'src/owned.js'), 'var category = true;\r\n');
    await writeFile(path.join(sourceDir, 'package.json'), '{"version":"12.3.0"}');
    await writeFile(path.join(distDir, 'index.html'), '<!doctype html>');
    await writeFile(path.join(distDir, 'app.1234.js'), 'var bundled = true;');
    const git = args => execFileSync('git', ['-C', sourceDir, '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8', stdio: 'pipe' });
    git(['init']); git(['add', '.']); git(['commit', '-m', 'fixture']);
    const metadata = { overlayDirectory: 'web/integration', serverWebVersion: '12.3.0', commit: git(['rev-parse', 'HEAD']).trim() };
    return { root, sourceDir, distDir, metadata };
}

test('Web identity validates pinned source and survives an unchanged verified build', async t => {
    const options = await fixture(t);
    const identity = await stampWebBuild(options);
    assert.deepEqual(await verifyWebBuild(options), identity);
    assert.equal(Object.keys(identity.assets).length, 2);
    assert.equal(identity.serverWebVersion, options.metadata.serverWebVersion);
    assert.equal(identity.sourceCommit, options.metadata.commit);
});

test('missing identity, stale version/commit, changed integration and changed assets fail closed', async t => {
    const options = await fixture(t);
    await assert.rejects(verifyWebBuild(options), /missing or invalid/);
    await stampWebBuild(options);
    for (const metadata of [
        { ...options.metadata, serverWebVersion: '12.4.0' },
        { ...options.metadata, commit: '0'.repeat(40) }
    ]) await assert.rejects(verifyWebBuild({ ...options, metadata }), /identity mismatch/);
    await writeFile(path.join(options.root, 'web/integration/src/owned.js'), 'var category = false;');
    await assert.rejects(verifyWebBuild(options), /integrationFingerprint/);
    await assert.rejects(stampWebBuild(options), /integration source is stale/);
    await writeFile(path.join(options.root, 'web/integration/src/owned.js'), 'var category = true;\n');
    await writeFile(path.join(options.distDir, 'app.1234.js'), 'modified after testing');
    await assert.rejects(verifyWebBuild(options), /assets changed/);
});

test('adding or removing a Web asset cannot bypass the verified build identity', async t => {
    const options = await fixture(t);
    await stampWebBuild(options);
    await writeFile(path.join(options.distDir, 'extra.js'), 'unexpected');
    await assert.rejects(verifyWebBuild(options), /assets changed/);
    await rm(path.join(options.distDir, 'extra.js'));
    await rm(path.join(options.distDir, 'app.1234.js'));
    await assert.rejects(verifyWebBuild(options), /assets changed/);
    assert.ok(JSON.parse(await readFile(path.join(options.distDir, BUILD_IDENTITY_FILE), 'utf8')).assets['app.1234.js']);
});

test('a different Git commit cannot be stamped as the declared Web source', async t => {
    const options = await fixture(t);
    await assert.rejects(stampWebBuild({ ...options, metadata: { ...options.metadata, commit: '0'.repeat(40) } }), /unexpected source version or commit/);
});
