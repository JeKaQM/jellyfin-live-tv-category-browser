import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BUILD_IDENTITY_FILE, describeWebBuild, webAssetHashes } from '../web-build-identity.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pythonExecutable = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const releaseVersion = (await readFile(path.join(projectRoot, 'Directory.Build.props'), 'utf8')).match(/<Version>([^<]+)<\/Version>/)[1];
const compatibility = JSON.parse(await readFile(path.join(projectRoot, 'web/compatibility.json'), 'utf8'));
const history = JSON.parse(await readFile(path.join(projectRoot, 'web/catalog-history.json'), 'utf8'));

test('catalog builder creates a Jellyfin repository manifest and complete plugin ZIP', async t => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'livetv-catalog-'));
    t.after(() => rm(temporaryRoot, { recursive: true, force: true }));

    const pluginDll = path.join(temporaryRoot, 'Jellyfin.Plugin.LiveTvCategories.dll');
    const webDist = path.join(temporaryRoot, 'web-dist');
    const output = path.join(temporaryRoot, 'catalog');
    await mkdir(path.join(webDist, 'assets'), { recursive: true });
    await writeFile(pluginDll, 'test plugin binary');
    await writeFile(path.join(webDist, 'index.html'), '<!doctype html>');
    await writeFile(path.join(webDist, 'assets', 'app.123.js'), 'console.log("test");');
    // Fixture binary/source for packaging format tests; production stamps also
    // verify the actual pinned source tree after compilation.
    const identity = { ...await describeWebBuild({ metadata: compatibility }), assets: await webAssetHashes(webDist) };
    await writeFile(path.join(webDist, BUILD_IDENTITY_FILE), JSON.stringify(identity));

    const build = () => execFileSync('bash', [path.join(projectRoot, 'scripts', 'build-catalog.sh')], {
        cwd: projectRoot,
        env: {
            ...process.env,
            BUILD_TIMESTAMP: '2026-08-21T00:00:00+00:00',
            CATALOG_OUTPUT_DIR: output,
            JELLYFIN_WEB_DIST: webDist,
            CATEGORY_BROWSER_DIST: path.join(projectRoot, 'web/standalone'),
            PLUGIN_DLL_PATH: pluginDll,
            PLUGIN_RELEASE_BASE_URL: `https://example.test/releases/download/v${releaseVersion}`,
            PLUGIN_SOURCE_URL: 'https://example.test/source',
            PYTHON: pythonExecutable
        }
    });

    build();
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].guid, 'a4b2fdc8-cb2a-463b-812a-16e9ea88e12a');
    assert.equal(manifest[0].versions.length, 1 + history.length);
    assert.equal(manifest[0].versions[0].version, releaseVersion);
    assert.equal(manifest[0].versions[0].targetAbi, compatibility.targetAbi);
    assert.equal(
        manifest[0].versions[0].sourceUrl,
        `https://example.test/releases/download/v${releaseVersion}/Jellyfin.Plugin.LiveTvCategories_${releaseVersion}.zip`);
    assert.match(manifest[0].versions[0].checksum, /^[0-9A-F]{32}$/);
    assert.equal(manifest[0].versions[0].timestamp, '2026-08-21T00:00:00+00:00');
    assert.deepEqual(manifest[0].versions.slice(1), history);

    const packagePath = path.join(output, `Jellyfin.Plugin.LiveTvCategories_${releaseVersion}.zip`);
    const entries = JSON.parse(execFileSync(pythonExecutable, [
        '-c',
        'import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))',
        packagePath
    ], { encoding: 'utf8' }));
    assert.deepEqual(entries, [
        'COMPATIBILITY.json',
        'Jellyfin.Plugin.LiveTvCategories.dll',
        'LICENSE',
        'NOTICE.md',
        'SOURCE.txt',
        'category-browser/app.css',
        'category-browser/app.js',
        'category-browser/browser-core.js',
        'category-browser/index.html',
        'web/index.html',
        `web/${BUILD_IDENTITY_FILE}`,
        'web/assets/app.123.js'
    ]);
    const packagedCompatibility = JSON.parse(execFileSync(pythonExecutable, [
        '-c', 'import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("COMPATIBILITY.json").decode())', packagePath
    ], { encoding: 'utf8' }));
    assert.deepEqual(packagedCompatibility, compatibility);

    const sourceNotice = execFileSync(pythonExecutable, [
        '-c',
        'import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("SOURCE.txt").decode())',
        packagePath
    ], { encoding: 'utf8' });
    assert.match(sourceNotice, /Project source: https:\/\/example\.test\/source/);
    assert.ok(sourceNotice.includes(`Jellyfin Web source: https://github.com/jellyfin/jellyfin-web/tree/${compatibility.tag}`));
    assert.ok(sourceNotice.includes(`Jellyfin Web commit: ${compatibility.commit}`));
    const originalPackage = await readFile(packagePath);
    await writeFile(path.join(webDist, 'assets/app.123.js'), 'stale or modified assets');
    assert.throws(build, /Web assets changed/);
    assert.deepEqual(await readFile(packagePath), originalPackage);
    await rm(path.join(webDist, BUILD_IDENTITY_FILE));
    assert.throws(build, /Web build identity is missing/);
    assert.deepEqual(await readFile(packagePath), originalPackage);
});
