using Jellyfin.Plugin.LiveTvCategories.WebClient;
using Xunit;

namespace Jellyfin.Plugin.LiveTvCategories.Tests;

public sealed class PluginWebClientStartupFilterTests
{
    public static IEnumerable<object[]> SupportedWebVersions =>
        WebCompatibilityManifest.Current.SupportedServerVersions.Select(version => new object[] { version });

    [Theory]
    [MemberData(nameof(SupportedWebVersions))]
    public void BundledWebAllowsEveryExplicitlyTestedServerVersion(string version)
    {
        Assert.True(PluginWebClientStartupFilter.CanServeBundledWeb(Version.Parse(version)));
    }

    [Fact]
    public void BundledWebNeverInfersSupportForAnUntestedMinorPatchOrMajor()
    {
        var manifest = WebCompatibilityManifest.Current;
        var highest = manifest.SupportedServerVersions.Select(Version.Parse).Max()!;
        var candidates = new[]
        {
            new Version(highest.Major, highest.Minor + 1, 0, 0),
            new Version(highest.Major, highest.Minor, highest.Build + 1, 0),
            new Version(highest.Major + 1, 0, 0, 0),
            new Version(11, 0, 0, 0)
        };
        foreach (var version in candidates)
        {
            Assert.False(PluginWebClientStartupFilter.CanServeBundledWeb(version));
        }
        foreach (var version in manifest.ApiSupportedServerVersions.Except(manifest.SupportedServerVersions))
        {
            Assert.False(PluginWebClientStartupFilter.CanServeBundledWeb(Version.Parse(version)));
        }
    }

    [Theory]
    [InlineData(null, "/web")]
    [InlineData("", "/web")]
    [InlineData("/", "/web")]
    [InlineData("/jellyfin", "/jellyfin/web")]
    [InlineData(" media/ ", "/media/web")]
    public void WebRequestPathIncludesConfiguredBaseUrl(string? baseUrl, string expected)
    {
        Assert.Equal(expected, PluginWebClientStartupFilter.WebRequestPathForBaseUrl(baseUrl));
    }

    [Theory]
    [InlineData(null, "/LiveTvCategories/ui")]
    [InlineData("/", "/LiveTvCategories/ui")]
    [InlineData("/jellyfin", "/jellyfin/LiveTvCategories/ui")]
    public void IndependentUiPathDoesNotDependOnFullWebCompatibility(string? baseUrl, string expected)
    {
        Assert.Equal(expected, PluginWebClientStartupFilter.IndependentUiRequestPathForBaseUrl(baseUrl));
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("null")]
    [InlineData("invalid JSON")]
    [InlineData("{\"schemaVersion\":99}")]
    public void InvalidCompatibilityDeclarationFailsClosed(string json)
    {
        Assert.Empty(WebCompatibilityManifest.Parse(json).SupportedServerVersions);
    }

    [Fact]
    public void CompatibilityDeclarationIsEmbeddedAndMatchesTheReleaseWeb()
    {
        var manifest = WebCompatibilityManifest.Current;
        Assert.Equal(1, manifest.SchemaVersion);
        Assert.True(Version.TryParse(manifest.ServerWebVersion, out _));
        Assert.True(Version.TryParse(manifest.ServerApiVersion, out var baseline));
        Assert.Equal(new Version(baseline!.Major, baseline.Minor, baseline.Build, 0), Version.Parse(manifest.TargetAbi));
        Assert.NotEmpty(manifest.ApiSupportedServerVersions);
        Assert.NotEmpty(manifest.SupportedServerVersions);
        Assert.All(manifest.SupportedServerVersions, version => Assert.Contains(version, manifest.ApiSupportedServerVersions));
    }

    [Fact]
    public void WebPatchVersionsDoNotInventMatchingServerVersions()
    {
        var manifest = WebCompatibilityManifest.Parse("""
            {
              "schemaVersion": 1,
              "serverWebVersion": "12.3.1",
              "targetAbi": "12.0.0.0",
              "targetFramework": "net10.0",
              "serverApiVersion": "12.0.0",
              "apiSupportedServerVersions": ["12.0.0.0", "12.3.0.0"],
              "supportedServerVersions": ["12.3.0.0"]
            }
            """);

        Assert.Equal(1, manifest.SchemaVersion);
        Assert.Equal("12.3.1", manifest.ServerWebVersion);
        Assert.Equal("12.3.0.0", Assert.Single(manifest.SupportedServerVersions));
        Assert.DoesNotContain("12.3.1.0", manifest.ApiSupportedServerVersions);
    }

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
