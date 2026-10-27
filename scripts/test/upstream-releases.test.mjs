import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertStableSupport, latestRelease, releaseVersion } from '../upstream-releases.mjs';
import { serverMatrix } from '../compatibility-matrix.mjs';
import { validateCatalogHistory } from '../catalog-history.mjs';

const metadata = {
    serverWebVersion: '12.3.0',
    apiSupportedServerVersions: ['12.0.0.0', '12.1.0.0', '12.2.0.0', '12.3.0.0'],
    supportedServerVersions: ['12.2.0.0', '12.3.0.0'],
    probeServerVersions: ['12.0.0', '12.1.0', '12.2.0', '12.3.0']
};
const release = tag_name => ({ tag_name, draft: false, prerelease: false });

test('upstream release tags normalize major/minor and patch releases without accepting prereleases or flags', () => {
    assert.equal(releaseVersion('v12.3'), '12.3.0');
    assert.equal(releaseVersion('v12.3.1'), '12.3.1');
    for (const tag of ['v13.0.0-rc1', '--branch=evil', 'v12', '../master', null]) assert.throws(() => releaseVersion(tag));
});

test('stable drift requires explicit API and latest-server Web support without widening declarations', () => {
    const before = JSON.stringify(metadata);
    assert.deepEqual(assertStableSupport(metadata, release('v12.3'), release('v12.3')), { serverVersion: '12.3.0', webVersion: '12.3.0' });
    assert.throws(() => assertStableSupport(metadata, release('v12.4'), release('v12.4')), /stable release drift/);
    const apiOnly = { ...metadata, apiSupportedServerVersions: [...metadata.apiSupportedServerVersions, '12.4.0.0'] };
    assert.throws(() => assertStableSupport(apiOnly, release('v12.4'), release('v12.3')), /Bundled Web is not declared tested on latest Server 12.4.0/);
    assert.throws(() => assertStableSupport(metadata, release('v12.3'), release('v12.3.1')), /Web 12.3.1 differs/);
    const webOnlyPatch = { ...metadata, serverWebVersion: '12.3.1' };
    assert.deepEqual(assertStableSupport(webOnlyPatch, release('v12.3'), release('v12.3.1')),
        { serverVersion: '12.3.0', webVersion: '12.3.1' });
    assert.throws(() => assertStableSupport(webOnlyPatch, release('v12.4'), release('v12.3.1')), /Bundled Web is not declared tested on latest Server/);
    assert.equal(JSON.stringify(metadata), before);
});

test('latest server probes include a new version without claiming support or losing BaseUrl coverage', () => {
    const matrix = serverMatrix(metadata, 'v12.4');
    assert.equal(matrix.include.length, 5);
    assert.ok(matrix.include.some(entry => entry.serverVersion === '12.4.0'));
    assert.ok(matrix.include.some(entry => entry.basePath === '/jellyfin'));
    assert.equal(serverMatrix(metadata, 'v12.3').include.length, 4);
    assert.equal(metadata.probeServerVersions.length, 4);
});

test('upstream API failure and non-stable responses are not treated as an unchanged release', async () => {
    await assert.rejects(latestRelease('jellyfin', { fetchImpl: async () => ({ ok: false, status: 503 }), token: null }), /503/);
    await assert.rejects(latestRelease('jellyfin', { fetchImpl: async () => ({ ok: true, json: async () => ({ ...release('v13.0'), prerelease: true }) }), token: null }), /published stable/);
    await assert.rejects(latestRelease('unexpected', { token: null }), /Unexpected upstream repository/);
});

test('catalog history keeps all published entries and rejects duplicates, future entries or damaged checksums', async () => {
    const history = JSON.parse(await readFile(new URL('../../web/catalog-history.json', import.meta.url), 'utf8'));
    const version = (await readFile(new URL('../../Directory.Build.props', import.meta.url), 'utf8')).match(/<Version>([^<]+)<\/Version>/)[1];
    assert.equal(validateCatalogHistory(history, version), history);
    const published = JSON.parse(await readFile(new URL('../../build/release-verify-v0.6.0.0/manifest.json', import.meta.url), 'utf8').catch(() => 'null'));
    if (published) assert.deepEqual(history.slice(-published[0].versions.length), published[0].versions);
    assert.throws(() => validateCatalogHistory([history[0], history[0]], version), /unique/);
    assert.throws(() => validateCatalogHistory(history, history[0].version), /older/);
    assert.throws(() => validateCatalogHistory([{ ...history[0], checksum: 'bad' }], version), /Invalid historical/);
});
