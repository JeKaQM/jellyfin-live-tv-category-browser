import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function source(relativePath) {
    return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('plugin is ABI-pinned and keeps category browsing out of the playback path', async () => {
    const [project, manifest, plugin, configuration, index, controller, webClient, registrator] = await Promise.all([
        source('Jellyfin.Plugin.LiveTvCategories/Jellyfin.Plugin.LiveTvCategories.csproj'),
        source('build.yaml'),
        source('Jellyfin.Plugin.LiveTvCategories/Plugin.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/Configuration/PluginConfiguration.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/Services/LiveTvCategoryIndex.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/Controllers/LiveTvCategoriesController.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/WebClient/PluginWebClientStartupFilter.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/PluginServiceRegistrator.cs')
    ]);

    assert.match(project, /Jellyfin\.Controller" Version="12\.0\.0"/);
    assert.match(project, /Jellyfin\.Model" Version="12\.0\.0"/);
    assert.match(project, /<TargetFramework>net10\.0<\/TargetFramework>/);
    assert.match(manifest, /targetAbi: "12\.0\.0\.0"/);
    assert.match(manifest, /version: "0\.3\.0\.0"/);
    assert.match(plugin, /BasePlugin<PluginConfiguration>/);
    assert.match(plugin, /Plugin\(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer\)/);
    assert.match(plugin, /: base\(applicationPaths, xmlSerializer\)/);
    assert.match(configuration, /PluginConfiguration : BasePluginConfiguration/);
    assert.match(index, /host\.Type, "m3u"/);
    assert.match(index, /GetChannels\(true, cancellationToken\)/);
    assert.doesNotMatch(controller, /MediaSource|HttpClient|FFmpeg|Transcod/i);
    assert.match(controller, /skipVisibilityCheck: true/);
    assert.doesNotMatch(index, /\.Path\b|HttpClient|FFmpeg|Transcod/i);
    assert.match(webClient, /UseStaticFiles/);
    assert.match(webClient, /Path\.Combine\(pluginDirectory, "web"\)/);
    assert.match(webClient, /X-Live-TV-Categories-Web/);
    assert.match(registrator, /AddSingleton<IStartupFilter, PluginWebClientStartupFilter>/);
});

test('build tooling is pinned to the Jellyfin 12 runtime', async () => {
    const [globalJson, testProject, buildPlugin, buildRelease, workflow] = await Promise.all([
        source('global.json'),
        source('Jellyfin.Plugin.LiveTvCategories.Tests/Jellyfin.Plugin.LiveTvCategories.Tests.csproj'),
        source('scripts/build-plugin.sh'),
        source('scripts/build-release.sh'),
        source('.github/workflows/release.yml')
    ]);

    assert.equal(JSON.parse(globalJson).sdk.version, '10.0.100');
    assert.match(testProject, /<TargetFramework>net10\.0<\/TargetFramework>/);
    assert.match(buildPlugin, /dotnet-sdk-10\.0/);
    assert.match(buildRelease, /mcr\.microsoft\.com\/dotnet\/sdk:10\.0/);
    assert.match(buildRelease, /node:24-bookworm/);
    assert.match(workflow, /dotnet-version: '10\.0\.x'/);
    assert.match(workflow, /node-version: '24\.x'/);
    assert.match(workflow, /npm run build:check/);
    assert.match(workflow, /npm run test/);
    assert.match(workflow, /npm run lint/);
    assert.match(workflow, /npm run stylelint/);
    assert.match(workflow, /npm run escheck/);
});

test('C# tests import the xUnit API explicitly', async () => {
    const tests = await source('Jellyfin.Plugin.LiveTvCategories.Tests/CategorySnapshotBuilderTests.cs');

    assert.match(tests, /^using Xunit;$/m);
});
