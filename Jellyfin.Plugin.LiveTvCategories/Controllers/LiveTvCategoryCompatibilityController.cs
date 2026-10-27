using System.Text.Json.Serialization;
using System.Reflection;
using Jellyfin.Plugin.LiveTvCategories.Services;
using Jellyfin.Plugin.LiveTvCategories.WebClient;
using MediaBrowser.Common;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.LiveTvCategories.Controllers;

/// <summary>Reports a small, authenticated compatibility contract without channel data.</summary>
[ApiController]
[Authorize(Policy = Policies.LiveTvAccess)]
[Route("LiveTvCategories")]
public sealed class LiveTvCategoryCompatibilityController : ControllerBase
{
    private readonly ILiveTvCompatibilityAdapter _adapter;
    private readonly IApplicationHost _applicationHost;

    public LiveTvCategoryCompatibilityController(ILiveTvCompatibilityAdapter adapter, IApplicationHost applicationHost)
    {
        _adapter = adapter;
        _applicationHost = applicationHost;
    }

    [HttpGet("Compatibility")]
    public ActionResult<LiveTvCategoryCompatibility> GetCompatibility()
    {
        var webState = PluginWebClientStartupFilter.GetCurrentBundledWebState(_applicationHost.ApplicationVersion);
        return new LiveTvCategoryCompatibility(
        "1",
        typeof(Plugin).Assembly.GetName().Version?.ToString() ?? "unknown",
        _applicationHost.ApplicationVersion.ToString(),
        WebCompatibilityManifest.Current.ServerApiVersion,
        typeof(Plugin).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .FirstOrDefault(attribute => attribute.Key == "JellyfinApiVersion")?.Value ?? "unknown",
        Version.TryParse(WebCompatibilityManifest.Current.ServerApiVersion, out var apiBaseline) ? $"{apiBaseline.Major}.x" : "unknown",
        WebCompatibilityManifest.Current.ApiSupportedServerVersions,
        WebCompatibilityManifest.Current.ApiSupportedServerVersions
            .Any(version => Version.TryParse(version, out var tested) && tested == _applicationHost.ApplicationVersion),
        _adapter.AdapterName,
        _adapter.Diagnostics.State,
        webState.Enabled,
        WebCompatibilityManifest.Current.SupportedServerVersions,
        new[] { "categorySummaries", "pagedChannels", "currentProgram", "independentUi" },
        webState.VersionOverrideEnabled,
        webState.VersionOverrideActive);
    }

    /// <summary>Detailed count-only status is restricted to administrators/API keys.</summary>
    [Authorize(Policy = Policies.RequiresElevation)]
    [HttpGet("Diagnostics")]
    public ActionResult<CategorySourceDiagnostics> GetDiagnostics() => _adapter.Diagnostics;
}

public sealed record LiveTvCategoryCompatibility(
    [property: JsonPropertyName("apiContractVersion")] string ApiContractVersion,
    [property: JsonPropertyName("pluginVersion")] string PluginVersion,
    [property: JsonPropertyName("serverVersion")] string ServerVersion,
    [property: JsonPropertyName("apiBaselineVersion")] string ApiBaselineVersion,
    [property: JsonPropertyName("compiledApiVersion")] string CompiledApiVersion,
    [property: JsonPropertyName("apiCompatibilityFamily")] string ApiCompatibilityFamily,
    [property: JsonPropertyName("apiTestedServerVersions")] IReadOnlyList<string> ApiTestedServerVersions,
    [property: JsonPropertyName("apiServerVersionTested")] bool ApiServerVersionTested,
    [property: JsonPropertyName("adapter")] string Adapter,
    [property: JsonPropertyName("adapterState")] string AdapterState,
    [property: JsonPropertyName("bundledWebEnabled")] bool BundledWebEnabled,
    [property: JsonPropertyName("bundledWebSupportedServerVersions")] IReadOnlyList<string> BundledWebSupportedServerVersions,
    [property: JsonPropertyName("features")] IReadOnlyList<string> Features,
    [property: JsonPropertyName("bundledWebVersionOverrideEnabled")] bool BundledWebVersionOverrideEnabled,
    [property: JsonPropertyName("bundledWebVersionOverrideActive")] bool BundledWebVersionOverrideActive);
