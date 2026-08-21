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

    assert.match(project, /Jellyfin\.Controller" Version="10\.11\.11"/);
    assert.match(project, /Jellyfin\.Model" Version="10\.11\.11"/);
    assert.match(project, /<TargetFramework>net9\.0<\/TargetFramework>/);
    assert.match(manifest, /targetAbi: "10\.11\.11\.0"/);
    assert.match(manifest, /version: "0\.2\.0\.0"/);
    assert.match(plugin, /BasePlugin<PluginConfiguration>/);
    assert.match(plugin, /Plugin\(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer\)/);
    assert.match(plugin, /: base\(applicationPaths, xmlSerializer\)/);
    assert.match(configuration, /PluginConfiguration : BasePluginConfiguration/);
    assert.match(index, /host\.Type, "m3u"/);
    assert.match(index, /GetChannels\(true, cancellationToken\)/);
    assert.doesNotMatch(controller, /MediaSource|HttpClient|FFmpeg|Transcod/i);
    assert.doesNotMatch(index, /\.Path\b|HttpClient|FFmpeg|Transcod/i);
    assert.match(webClient, /UseStaticFiles/);
    assert.match(webClient, /Path\.Combine\(pluginDirectory, "web"\)/);
    assert.match(webClient, /X-Live-TV-Categories-Web/);
    assert.match(registrator, /AddSingleton<IStartupFilter, PluginWebClientStartupFilter>/);
});

test('C# tests import the xUnit API explicitly', async () => {
    const tests = await source('Jellyfin.Plugin.LiveTvCategories.Tests/CategorySnapshotBuilderTests.cs');

    assert.match(tests, /^using Xunit;$/m);
});
