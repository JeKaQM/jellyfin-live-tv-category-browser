import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pythonExecutable = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const releaseVersion = (await readFile(path.join(projectRoot, 'Directory.Build.props'), 'utf8')).match(/<Version>([^<]+)<\/Version>/)[1];
const compatibility = JSON.parse(await readFile(path.join(projectRoot, 'web/compatibility.json'), 'utf8'));

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

    execFileSync('bash', [path.join(projectRoot, 'scripts', 'build-catalog.sh')], {
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

    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].guid, 'a4b2fdc8-cb2a-463b-812a-16e9ea88e12a');
    assert.equal(manifest[0].versions.length, 5);
    assert.equal(manifest[0].versions[0].version, releaseVersion);
    assert.equal(manifest[0].versions[0].targetAbi, compatibility.targetAbi);
    assert.equal(
        manifest[0].versions[0].sourceUrl,
        `https://example.test/releases/download/v${releaseVersion}/Jellyfin.Plugin.LiveTvCategories_${releaseVersion}.zip`);
    assert.match(manifest[0].versions[0].checksum, /^[0-9A-F]{32}$/);
    assert.equal(manifest[0].versions[0].timestamp, '2026-08-21T00:00:00+00:00');
    assert.deepEqual(manifest[0].versions[1], {
        version: '0.5.0.0',
        changelog: 'Jellyfin 12.2 compatibility and its latest Web fixes, updated setup helper authentication, TV-safe icons and category-aware playback navigation.',
        targetAbi: '12.2.0.0',
        sourceUrl: 'https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.5.0.0/Jellyfin.Plugin.LiveTvCategories_0.5.0.0.zip',
        checksum: 'BBD5F3724E2975E8C2CE48A49ABA1255',
        timestamp: '2026-10-09T08:40:32+00:00'
    });
    assert.deepEqual(manifest[0].versions[2], {
        version: '0.4.0.0',
        changelog: 'Jellyfin 12.1 compatibility while retaining TV-safe icons and category-aware playback navigation.',
        targetAbi: '12.1.0.0',
        sourceUrl: 'https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.4.0.0/Jellyfin.Plugin.LiveTvCategories_0.4.0.0.zip',
        checksum: '1EFB0F744A5DB65C48364AAA4F6AD5F9',
        timestamp: '2026-09-17T20:04:55+00:00'
    });
    assert.deepEqual(manifest[0].versions[3], {
        version: '0.3.0.0',
        changelog: 'Jellyfin 12 compatibility with improved TV icon rendering and category-aware playback navigation.',
        targetAbi: '12.0.0.0',
        sourceUrl: 'https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.3.0.0/Jellyfin.Plugin.LiveTvCategories_0.3.0.0.zip',
        checksum: '2FA4C24399B9CC8BF587457EF69BF11B',
        timestamp: '2026-09-11T17:39:50+01:00'
    });
    assert.deepEqual(manifest[0].versions[4], {
        version: '0.2.0.0',
        changelog: 'UI-installable package with responsive category tiles and a bundled Jellyfin Web 10.11.11 client.',
        targetAbi: '10.11.11.0',
        sourceUrl: 'https://github.com/JeKaQM/jellyfin-live-tv-category-browser/releases/download/v0.2.0.0/Jellyfin.Plugin.LiveTvCategories_0.2.0.0.zip',
        checksum: '1A87C1C87086002152D1A9DEB5A84487',
        timestamp: '2026-08-21T22:18:44+01:00'
    });

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
    assert.match(sourceNotice, /Jellyfin Web source: https:\/\/github\.com\/jellyfin\/jellyfin-web\/tree\/v12\.2/);
    assert.match(sourceNotice, /Jellyfin Web commit: 61b1f890365ad15138e943e694af723c1d47df2a/);
});
