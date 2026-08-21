import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const collectorPath = path.resolve(testDirectory, '..', 'collect-discovery.sh');

function json(response, value) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
}

test('collector creates a useful bundle without secrets or stream data', async (context) => {
    const secretApiKey = 'never-include-this-api-key';
    const secretProviderUrl = 'https://provider.invalid:8443';
    const secretProviderUsername = 'private-provider-user';
    const secretProviderPassword = 'private-provider-password';
    const pluginId = '63ba5fcdc8ce421a83e8ba0b11030d53';
    const primaryUserId = '11111111111111111111111111111111';
    const secondaryUserId = '22222222222222222222222222222222';
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'jellyfin-category-discovery-'));
    context.after(() => rm(outputDirectory, { recursive: true, force: true }));

    const server = http.createServer((request, response) => {
        assert.equal(request.headers['x-emby-token'], secretApiKey);
        const requestUrl = new URL(request.url, 'http://127.0.0.1');

        switch (requestUrl.pathname) {
            case '/System/Info/Public':
            case '/System/Info':
                json(response, {
                    ProductName: 'Jellyfin Server',
                    Version: '10.test.1',
                    OperatingSystem: 'Linux',
                    Architecture: 'X64',
                    LocalAddress: 'http://private.invalid:8096'
                });
                break;
            case '/Plugins':
                json(response, [
                    { Name: 'Xtream Library', Version: '1.2.3', Id: pluginId, Status: 'Active' },
                    { Name: 'Unrelated Secret Plugin', Version: '9.9.9' }
                ]);
                break;
            case `/Plugins/${pluginId}/Configuration`:
                json(response, {
                    EnableLiveTv: true,
                    EnableNativeTuner: true,
                    LiveChannelMode: 'Custom',
                    SelectedLiveCategoryIds: [7],
                    ExcludedLiveStreamIds: [999],
                    EnableEpg: true,
                    Providers: [{
                        BaseUrl: secretProviderUrl,
                        Username: secretProviderUsername,
                        Password: secretProviderPassword
                    }]
                });
                break;
            case '/XtreamLibrary/Categories/Live':
                json(response, [
                    { CategoryId: 7, CategoryName: 'EU | UK GENERAL' },
                    { CategoryId: 8, CategoryName: 'EU | UK SPORT' }
                ]);
                break;
            case '/web/package.json':
                json(response, { name: 'jellyfin-web', version: '10.test.web' });
                break;
            case '/Users':
                json(response, [
                    {
                        Id: primaryUserId,
                        Name: 'Private User Name',
                        Policy: { EnableLiveTvAccess: true, IsAdministrator: true }
                    },
                    {
                        Id: secondaryUserId,
                        Name: 'Second Private User',
                        Policy: { EnableLiveTvAccess: false, IsAdministrator: false }
                    }
                ]);
                break;
            case '/LiveTv/Info':
                json(response, {
                    IsEnabled: true,
                    EnabledUsers: [primaryUserId],
                    Services: [{
                        Name: 'Xtream Library',
                        Status: 'Ok',
                        Version: '1.2.3',
                        IsVisible: true,
                        HomePageUrl: secretProviderUrl,
                        StatusMessage: secretProviderPassword,
                        Tuners: ['Private tuner name']
                    }]
                });
                break;
            case '/ScheduledTasks':
                json(response, [{
                    Id: 'refresh-guide-task',
                    Name: 'Refresh Guide',
                    Key: 'RefreshGuide',
                    Category: 'Live TV',
                    State: 'Idle',
                    LastExecutionResult: {
                        Status: 'Completed',
                        StartTimeUtc: '2026-08-21T12:00:00Z',
                        EndTimeUtc: '2026-08-21T12:01:00Z',
                        ErrorMessage: secretProviderPassword
                    }
                }]);
                break;
            case '/LiveTv/Channels': {
                const requestedUser = requestUrl.searchParams.get('UserId');
                const total = requestedUser === secondaryUserId ? 0 : 27_000;
                json(response, {
                    TotalRecordCount: total,
                    Items: total ? [{
                        Id: 'channel-id',
                        Name: 'BBC One',
                        ChannelNumber: '1',
                        ChannelGroup: 'EU | UK GENERAL',
                        Tags: ['HD'],
                        Path: 'https://provider.invalid/user/password/stream',
                        MediaSources: [{ Path: 'https://provider.invalid/secret' }]
                    }] : []
                });
                break;
            }
            case '/Items':
                json(response, {
                    TotalRecordCount: 27_000,
                    Items: [{
                        Id: 'channel-id',
                        Name: 'BBC One',
                        ChannelNumber: '1',
                        ChannelGroup: 'EU | UK GENERAL',
                        Tags: ['HD'],
                        Path: 'https://provider.invalid/user/password/stream',
                        MediaSources: [{ Path: 'https://provider.invalid/secret' }]
                    }]
                });
                break;
            case '/Items/Filters':
                json(response, { Tags: ['HD'], Genres: [] });
                break;
            case '/Items/Filters2':
                json(response, { Genres: [] });
                break;
            default:
                response.writeHead(404);
                response.end();
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(() => new Promise((resolve) => server.close(resolve)));
    const address = server.address();

    await execFileAsync('bash', [collectorPath], {
        cwd: path.resolve(testDirectory, '..', '..'),
        env: {
            ...process.env,
            JELLYFIN_URL: `http://127.0.0.1:${address.port}`,
            JELLYFIN_API_KEY: secretApiKey,
            DISCOVERY_OUTPUT_DIR: outputDirectory
        }
    });

    const outputNames = await readdir(outputDirectory);
    assert.equal(outputNames.length, 1);
    const outputText = await readFile(path.join(outputDirectory, outputNames[0]), 'utf8');
    const bundle = JSON.parse(outputText);

    assert.equal(bundle.SchemaVersion, 2);
    assert.equal(bundle.Server.Version, '10.test.1');
    assert.equal(bundle.JellyfinWebVersion, '10.test.web');
    assert.deepEqual(bundle.XtreamPlugins, [{
        Name: 'Xtream Library',
        Version: '1.2.3',
        Id: pluginId,
        Status: 'Active'
    }]);
    assert.equal(bundle.XtreamConfiguration.EnableLiveTv, true);
    assert.equal(bundle.XtreamConfiguration.EnableNativeTuner, true);
    assert.equal(bundle.XtreamConfiguration.LiveChannelMode, 'Custom');
    assert.equal(bundle.XtreamConfiguration.SelectedLiveCategoryCount, 1);
    assert.equal(bundle.XtreamConfiguration.ConfiguredProviderCount, 1);
    assert.equal(bundle.XtreamCategoryProbe.CategoryCount, 2);
    assert.deepEqual(bundle.XtreamCategoryProbe.SampleNames, ['EU | UK GENERAL', 'EU | UK SPORT']);
    assert.equal(bundle.XtreamCategoryProbe.SelectedCategoryIdsMatched, 1);
    assert.equal(bundle.PerUserChannelCounts.length, 2);
    assert.equal(bundle.PerUserChannelCounts[0].SelectedForDetailedProbe, true);
    assert.equal(bundle.PerUserChannelCounts[0].ChannelCount, 27_000);
    assert.equal(bundle.PerUserChannelCounts[1].ChannelCount, 0);
    assert.equal(bundle.LiveTvInfo.Services[0].TunerCount, 1);
    assert.equal(bundle.RelevantScheduledTasks[0].LastExecution.Status, 'Completed');
    assert.equal(bundle.Hints.CategoryFieldVisibleOnLiveTvDto, true);
    assert.equal(bundle.LiveTvChannelsProbe.TotalRecordCount, 27_000);
    assert.ok(!outputText.includes(secretApiKey));
    assert.ok(!outputText.includes('provider.invalid'));
    assert.ok(!outputText.includes(secretProviderUsername));
    assert.ok(!outputText.includes(secretProviderPassword));
    assert.ok(!outputText.includes('Private User Name'));
    assert.ok(!outputText.includes('Second Private User'));
    assert.ok(!outputText.includes('Private tuner name'));
    assert.ok(!outputText.includes('Unrelated Secret Plugin'));
    assert.equal(bundle.LiveTvChannelsProbe.Samples[0].MediaSources, undefined);
    assert.equal(bundle.LiveTvChannelsProbe.Samples[0].Path, undefined);
    assert.equal(bundle.Redaction.MediaSourcesIncluded, false);
    assert.equal(bundle.Redaction.StreamPathsIncluded, false);
});
