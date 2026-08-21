import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const setupScript = path.resolve(testDirectory, '..', 'configure-dispatcharr-jellyfin.sh');

function sendJson(response, value, statusCode = 200) {
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
}

async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test('headless setup adds Dispatcharr once, refreshes guide and reports channels', async (context) => {
    const apiKey = 'do-not-print-this-key';
    const userId = '11111111111111111111111111111111';
    const tunerHosts = [];
    const listingProviders = [];
    let tunerPosts = 0;
    let listingPosts = 0;
    let refreshPosts = 0;

    const server = http.createServer(async (request, response) => {
        const requestUrl = new URL(request.url, 'http://127.0.0.1');
        const isDispatcharrOutput = requestUrl.pathname.startsWith('/output/');
        if (!isDispatcharrOutput) {
            assert.equal(request.headers['x-emby-token'], apiKey);
        }

        if (request.method === 'HEAD' && requestUrl.pathname === '/output/epg') {
            response.writeHead(200, { 'content-type': 'application/xml' });
            response.end();
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/output/m3u') {
            response.writeHead(200, { 'content-type': 'audio/x-mpegurl' });
            response.end([
                '#EXTM3U',
                '#EXTINF:-1 tvg-id="1" group-title="EU | UK GENERAL",BBC One',
                'http://private.invalid/stream/1',
                '#EXTINF:-1 tvg-id="2" group-title="EU | UK GENERAL",BBC Two',
                'http://private.invalid/stream/2',
                '#EXTINF:-1 tvg-id="3" group-title="EU | UK SPORT",Sky Sports',
                'http://private.invalid/stream/3',
                ''
            ].join('\n'));
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/System/Info') {
            sendJson(response, { Version: '10.11.11' });
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/System/Configuration/livetv') {
            sendJson(response, { TunerHosts: tunerHosts, ListingProviders: listingProviders });
            return;
        }

        if (request.method === 'POST' && requestUrl.pathname === '/LiveTv/TunerHosts') {
            const body = await readJsonBody(request);
            tunerPosts += 1;
            assert.equal(body.Type, 'm3u');
            assert.equal(body.FriendlyName, 'Dispatcharr');
            assert.equal(body.TunerCount, 0);
            tunerHosts.push({ ...body, Id: 'dispatcharr-tuner' });
            sendJson(response, tunerHosts.at(-1));
            return;
        }

        if (request.method === 'POST' && requestUrl.pathname === '/LiveTv/ListingProviders') {
            const body = await readJsonBody(request);
            listingPosts += 1;
            assert.equal(body.Type, 'xmltv');
            assert.equal(body.EnableAllTuners, true);
            listingProviders.push({ ...body, Id: 'dispatcharr-guide' });
            sendJson(response, listingProviders.at(-1));
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/Users') {
            sendJson(response, [{
                Id: userId,
                Name: 'Private Admin Name',
                Policy: { EnableLiveTvAccess: true, IsAdministrator: true }
            }]);
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/ScheduledTasks') {
            sendJson(response, [{
                Id: 'refresh-guide',
                Key: 'RefreshGuide',
                Name: 'Refresh Guide',
                State: refreshPosts ? 'Running' : 'Idle'
            }]);
            return;
        }

        if (request.method === 'POST' && requestUrl.pathname === '/ScheduledTasks/Running/refresh-guide') {
            refreshPosts += 1;
            response.writeHead(204);
            response.end();
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/LiveTv/Channels') {
            assert.equal(requestUrl.searchParams.get('UserId'), userId);
            sendJson(response, { TotalRecordCount: refreshPosts ? 3 : 0, Items: [] });
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/Plugins') {
            sendJson(response, [{ Name: 'Xtream Library', Status: 'Active' }]);
            return;
        }

        response.writeHead(404);
        response.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(() => new Promise((resolve) => server.close(resolve)));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const environment = {
        ...process.env,
        JELLYFIN_URL: baseUrl,
        DISPATCHARR_URL: baseUrl,
        JELLYFIN_API_KEY: apiKey,
        JELLYFIN_WAIT_SECONDS: '2'
    };

    const first = await execFileAsync('bash', [setupScript], { env: environment });
    assert.match(first.stdout, /Dispatcharr exports 3 playlist entries in 2 groups/);
    assert.match(first.stdout, /Added Dispatcharr as Jellyfin's M3U tuner/);
    assert.match(first.stdout, /Added Dispatcharr as Jellyfin's XMLTV guide source/);
    assert.match(first.stdout, /Jellyfin now exposes 3 Live TV channels/);
    assert.match(first.stdout, /Xtream Library is still active/);
    assert.ok(!first.stdout.includes(apiKey));
    assert.ok(!first.stdout.includes('Private Admin Name'));
    assert.ok(!first.stdout.includes('private.invalid'));
    assert.equal(tunerPosts, 1);
    assert.equal(listingPosts, 1);
    assert.equal(refreshPosts, 1);

    const second = await execFileAsync('bash', [setupScript], { env: environment });
    assert.match(second.stdout, /M3U tuner already exists/);
    assert.match(second.stdout, /XMLTV guide already exists/);
    assert.match(second.stdout, /Refresh Guide task is already running/);
    assert.equal(tunerPosts, 1);
    assert.equal(listingPosts, 1);
    assert.equal(refreshPosts, 1);
});
