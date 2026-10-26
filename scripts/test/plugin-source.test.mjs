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
    const [project, manifest, plugin, configuration, index, controller, webClient, registrator, adapter, compatibility] = await Promise.all([
        source('Jellyfin.Plugin.LiveTvCategories/Jellyfin.Plugin.LiveTvCategories.csproj'),
        source('build.yaml'),
        source('Jellyfin.Plugin.LiveTvCategories/Plugin.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/Configuration/PluginConfiguration.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/Services/LiveTvCategoryIndex.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/Controllers/LiveTvCategoriesController.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/WebClient/PluginWebClientStartupFilter.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/PluginServiceRegistrator.cs'),
        source('Jellyfin.Plugin.LiveTvCategories/Services/JellyfinLiveTvCompatibilityAdapter.cs'),
        source('web/compatibility.json')
    ]);

    assert.match(project, /Jellyfin\.Controller" Version="\$\(JellyfinApiVersion\)"/);
    assert.match(project, /Jellyfin\.Model" Version="\$\(JellyfinApiVersion\)"/);
    assert.match(project, /EmbeddedResource Include="\.\.\/web\/compatibility\.json"/);
    assert.match(project, /<TargetFramework>net10\.0<\/TargetFramework>/);
    assert.ok(manifest.includes(`targetAbi: "${JSON.parse(compatibility).targetAbi}"`));
    const version = (await source('Directory.Build.props')).match(/<Version>([^<]+)<\/Version>/)[1];
    assert.ok(manifest.includes(`version: "${version}"`));
    assert.match(plugin, /BasePlugin<PluginConfiguration>/);
    assert.match(plugin, /Plugin\(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer\)/);
    assert.match(plugin, /: base\(applicationPaths, xmlSerializer\)/);
    assert.match(configuration, /PluginConfiguration : BasePluginConfiguration/);
    assert.match(adapter, /host\.Type, "m3u"/);
    assert.match(adapter, /GetChannels\(true, token\)/);
    assert.doesNotMatch(controller, /MediaSource|HttpClient|FFmpeg|Transcod/i);
    assert.match(adapter, /skipVisibilityCheck: true/);
    assert.match(controller, /_adapter\.GetChannelDtos/);
    assert.match(index, /GetVisibleChannelIds/);
    assert.doesNotMatch(index, /MediaBrowser\.Controller|Jellyfin\.Database/);
    assert.doesNotMatch(index, /\.Path\b|HttpClient|FFmpeg|Transcod/i);
    assert.match(webClient, /UseStaticFiles/);
    assert.match(webClient, /Path\.Combine\(pluginDirectory, "web"\)/);
    assert.match(webClient, /X-Live-TV-Categories-Web/);
    assert.match(registrator, /AddSingleton<IStartupFilter, PluginWebClientStartupFilter>/);
});

test('build tooling is pinned to the Jellyfin 12 runtime', async () => {
    const [globalJson, testProject, buildPlugin, buildRelease, workflow, compatibilityWorkflow] = await Promise.all([
        source('global.json'),
        source('Jellyfin.Plugin.LiveTvCategories.Tests/Jellyfin.Plugin.LiveTvCategories.Tests.csproj'),
        source('scripts/build-plugin.sh'),
        source('scripts/build-release.sh'),
        source('.github/workflows/release.yml'),
        source('.github/workflows/compatibility.yml')
    ]);

    assert.equal(JSON.parse(globalJson).sdk.version, '10.0.100');
    assert.match(testProject, /<TargetFramework>net10\.0<\/TargetFramework>/);
    assert.match(buildPlugin, /dotnet-sdk-10\.0/);
    assert.match(buildRelease, /mcr\.microsoft\.com\/dotnet\/sdk:10\.0/);
    assert.match(buildRelease, /node:24-bookworm/);
    assert.match(compatibilityWorkflow, /dotnet-version: '10\.0\.x'/);
    assert.match(workflow, /node-version: '24\.x'/);
    assert.match(workflow, /needs: compatibility/);
    assert.match(compatibilityWorkflow, /npm run build:check/);
    assert.match(compatibilityWorkflow, /npm run test:browser/);
    assert.match(compatibilityWorkflow, /npm run lint/);
    assert.match(compatibilityWorkflow, /npm run stylelint/);
    assert.match(compatibilityWorkflow, /npm run escheck/);
    assert.match(compatibilityWorkflow, /smoke-server\.ps1/);
    assert.doesNotMatch(compatibilityWorkflow, /build\/jellyfin-web-\d/);
    assert.match(compatibilityWorkflow, /web-build-identity\.mjs stamp/);
    assert.match(compatibilityWorkflow, /check-stable-support\.mjs/);
    const canaryWorkflow = await source('.github/workflows/upstream-canary.yml');
    assert.match(canaryWorkflow, /target: \[latest-stable, master\]/);
});

test('C# tests import the xUnit API explicitly', async () => {
    const tests = await source('Jellyfin.Plugin.LiveTvCategories.Tests/CategorySnapshotBuilderTests.cs');

    assert.match(tests, /^using Xunit;$/m);
});
