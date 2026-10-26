import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareSource, resolveOverlayDirectory } from '../prepare-jellyfin-web.mjs';

const git = (cwd, args, input) => execFileSync('git', ['-C', cwd, ...args], { input, encoding: 'utf8' }).trim();
const hash = (cwd, content) => git(cwd, ['hash-object', '--stdin'], content);

test('owned integration source is version-neutral and metadata paths cannot escape the repository', () => {
    const project = path.resolve('fixture-project');
    assert.equal(resolveOverlayDirectory({ releaseLine: '12.3', overlayDirectory: 'web/integration' }, project), path.join(project, 'web/integration'));
    assert.equal(resolveOverlayDirectory({ releaseLine: '12.2' }, project), path.join(project, 'web/patches/jellyfin-web-12.2'));
    for (const overlayDirectory of ['../outside', '/absolute', 'C:/outside', 'web/../outside', 'web\\integration', '']) {
        assert.throws(() => resolveOverlayDirectory({ releaseLine: '12.3', overlayDirectory }, project), /Unsafe managed path/);
    }
});

async function fixture(t) {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'ltvc-prepare-test-'));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const sourceDir = path.join(temp, 'source');
    const overlayDir = path.join(temp, 'overlay');
    await mkdir(path.join(sourceDir, 'src'), { recursive: true });
    await mkdir(path.join(overlayDir, 'src'), { recursive: true });
    git(sourceDir, ['init', '-q']);
    git(sourceDir, ['config', 'core.autocrlf', 'false']);
    git(sourceDir, ['config', 'user.email', 'test@example.invalid']);
    git(sourceDir, ['config', 'user.name', 'Preparation Test']);
    const upstream = '// upstream before\nexport const programs = "stock";\nexport const guide = "unchanged";\n';
    const template = '<div>untouched upstream template</div>\n';
    await writeFile(path.join(sourceDir, 'package.json'), '{"version":"12.2.0"}\n');
    await writeFile(path.join(sourceDir, 'src/upstream.js'), upstream);
    await writeFile(path.join(sourceDir, 'src/template.html'), template);
    git(sourceDir, ['add', '.']);
    git(sourceDir, ['commit', '-qm', 'Fixture source']);
    await writeFile(path.join(overlayDir, 'src/category.js'), 'export const category = true;\n');
    await writeFile(path.join(overlayDir, 'integration.patch'), '--- a/src/upstream.js\n+++ b/src/upstream.js\n@@ -1,3 +1,3 @@\n // upstream before\n-export const programs = "stock";\n+export const programs = "categories";\n export const guide = "unchanged";\n');
    const metadata = {
        schemaVersion: 1, serverWebVersion: '12.2.0', commit: git(sourceDir, ['rev-parse', 'HEAD']),
        patches: ['integration.patch'],
        upstreamHashes: { 'src/upstream.js': hash(sourceDir, upstream), 'src/template.html': hash(sourceDir, template) },
        previousOverlayHashes: {}
    };
    return { sourceDir, overlayDir, metadata, upstream, template };
}

test('small integration patches preserve upstream tabs/template and are idempotent', async t => {
    const options = await fixture(t);
    const first = await prepareSource(options);
    const source = await readFile(path.join(options.sourceDir, 'src/upstream.js'), 'utf8');
    assert.match(source, /programs = "categories"/);
    assert.match(source, /guide = "unchanged"/);
    assert.equal(await readFile(path.join(options.sourceDir, 'src/template.html'), 'utf8'), options.template);
    assert.equal(first.changedFiles, 2);
    assert.equal((await prepareSource(options)).changedFiles, 0);
});

test('Windows CRLF patch checkouts apply against canonical upstream files without editing the patch', async t => {
    const options = await fixture(t);
    const patchPath = path.join(options.overlayDir, 'integration.patch');
    const patch = (await readFile(patchPath, 'utf8')).replace(/\n/g, '\r\n');
    await writeFile(patchPath, patch);
    await prepareSource(options);
    assert.match(await readFile(path.join(options.sourceDir, 'src/upstream.js'), 'utf8'), /programs = "categories"/);
    assert.equal(await readFile(patchPath, 'utf8'), patch);
    assert.equal((await prepareSource(options)).changedFiles, 0);
});

test('all targets are validated before any upstream or owned file is changed', async t => {
    const options = await fixture(t);
    const edited = '// user-owned conflicting file\n';
    await writeFile(path.join(options.sourceDir, 'src/category.js'), edited);
    await assert.rejects(prepareSource(options), /Refusing to overwrite modified/);
    assert.equal(await readFile(path.join(options.sourceDir, 'src/upstream.js'), 'utf8'), options.upstream);
    assert.equal(await readFile(path.join(options.sourceDir, 'src/category.js'), 'utf8'), edited);
});

test('unexpected upstream edits are refused even if the patch context still matches', async t => {
    const options = await fixture(t);
    const edited = `${options.upstream}// custom unrelated upstream edit\n`;
    await writeFile(path.join(options.sourceDir, 'src/upstream.js'), edited);
    await assert.rejects(prepareSource(options), /Refusing to overwrite modified/);
    assert.equal(await readFile(path.join(options.sourceDir, 'src/upstream.js'), 'utf8'), edited);
    await assert.rejects(readFile(path.join(options.sourceDir, 'src/category.js')), { code: 'ENOENT' });
});

test('invalid patch context cannot partially apply the integration', async t => {
    const options = await fixture(t);
    const patch = path.join(options.overlayDir, 'integration.patch');
    await writeFile(patch, (await readFile(patch, 'utf8')).replace('"stock"', '"unexpected"'));
    await assert.rejects(prepareSource(options));
    assert.equal(await readFile(path.join(options.sourceDir, 'src/upstream.js'), 'utf8'), options.upstream);
    await assert.rejects(readFile(path.join(options.sourceDir, 'src/category.js')), { code: 'ENOENT' });
});

test('known previous overlays migrate without granting permission to arbitrary edits', async t => {
    const options = await fixture(t);
    const oldController = '// explicitly fingerprinted previous controller overlay\n';
    const oldTemplate = '<div>old full template overlay</div>\n';
    options.metadata.previousOverlayHashes['src/upstream.js'] = [hash(options.sourceDir, oldController)];
    options.metadata.previousOverlayHashes['src/template.html'] = [hash(options.sourceDir, oldTemplate)];
    await writeFile(path.join(options.sourceDir, 'src/upstream.js'), oldController);
    await writeFile(path.join(options.sourceDir, 'src/template.html'), oldTemplate);
    await prepareSource(options);
    assert.match(await readFile(path.join(options.sourceDir, 'src/upstream.js'), 'utf8'), /categories/);
    assert.equal(await readFile(path.join(options.sourceDir, 'src/template.html'), 'utf8'), options.template);
});

test('version, commit, schema and unmanaged patch paths are independently rejected', async t => {
    const options = await fixture(t);
    for (const metadata of [
        { ...options.metadata, schemaVersion: 99 },
        { ...options.metadata, serverWebVersion: '12.3.0' },
        { ...options.metadata, commit: '0'.repeat(40) }
    ]) {
        await assert.rejects(prepareSource({ ...options, metadata }));
    }
    const patch = path.join(options.overlayDir, 'integration.patch');
    await writeFile(patch, (await readFile(patch, 'utf8')).replaceAll('src/upstream.js', '../../outside.js'));
    await assert.rejects(prepareSource(options), /unmanaged paths/);
    assert.equal(await readFile(path.join(options.sourceDir, 'src/upstream.js'), 'utf8'), options.upstream);
});
