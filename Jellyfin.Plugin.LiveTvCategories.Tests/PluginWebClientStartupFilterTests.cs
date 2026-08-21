using Jellyfin.Plugin.LiveTvCategories.WebClient;
using Xunit;

namespace Jellyfin.Plugin.LiveTvCategories.Tests;

public sealed class PluginWebClientStartupFilterTests
{
    [Theory]
    [InlineData("index.html")]
    [InlineData("INDEX.HTML")]
    [InlineData("config.json")]
    [InlineData("manifest.json")]
    [InlineData("serviceworker.js")]
    public void MutableShellFilesAreNotCached(string name)
    {
        Assert.True(PluginWebClientStartupFilter.IsMutableShellFile(name));
        Assert.Equal(
            "no-cache, no-store, must-revalidate",
            PluginWebClientStartupFilter.CacheControlForFile(name));
    }

    [Theory]
    [InlineData("livetv-livetvsuggested.13e49904b4c4a638f8f2.chunk.js")]
    [InlineData("main.jellyfin.f725276386e5b19afe0c.css")]
    [InlineData("73560.1274c92926553359e1c1.css")]
    public void FingerprintedAssetsAreCachedImmutably(string name)
    {
        Assert.False(PluginWebClientStartupFilter.IsMutableShellFile(name));
        Assert.Equal(
            "public, max-age=31536000, immutable",
            PluginWebClientStartupFilter.CacheControlForFile(name));
    }

    [Theory]
    [InlineData("runtime.bundle.js")]
    [InlineData("main.jellyfin.bundle.js")]
    [InlineData("logo.png")]
    public void StableAssetNamesUseShortCaching(string name)
    {
        Assert.Equal("public, max-age=3600", PluginWebClientStartupFilter.CacheControlForFile(name));
    }
}
