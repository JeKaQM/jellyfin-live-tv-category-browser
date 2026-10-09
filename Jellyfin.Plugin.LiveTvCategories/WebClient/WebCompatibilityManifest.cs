using System.Text.Json;

namespace Jellyfin.Plugin.LiveTvCategories.WebClient;

/// <summary>
/// Reads the same compatibility declaration used by preparation and release tooling.
/// A missing or invalid declaration fails closed: never replace Jellyfin's stock Web.
/// </summary>
internal sealed record WebCompatibilityManifest(
    int SchemaVersion,
    string ServerWebVersion,
    string TargetAbi,
    string TargetFramework,
    IReadOnlyList<string> SupportedServerVersions,
    string ServerApiVersion,
    IReadOnlyList<string> ApiSupportedServerVersions)
{
    public static WebCompatibilityManifest Current { get; } = Load();

    internal static WebCompatibilityManifest Parse(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var schemaVersion = root.GetProperty("schemaVersion").GetInt32();
            var serverWebVersion = root.GetProperty("serverWebVersion").GetString();
            var targetAbi = root.GetProperty("targetAbi").GetString();
            var targetFramework = root.GetProperty("targetFramework").GetString();
            var serverApiVersion = root.GetProperty("serverApiVersion").GetString();
            var supported = root.GetProperty("supportedServerVersions")
                .EnumerateArray().Select(version => version.GetString() ?? string.Empty).ToArray();
            var apiSupported = root.GetProperty("apiSupportedServerVersions")
                .EnumerateArray().Select(version => version.GetString() ?? string.Empty).ToArray();
            if (schemaVersion != 1 || string.IsNullOrWhiteSpace(targetFramework)
                || !Version.TryParse(serverWebVersion, out _)
                || !Version.TryParse(targetAbi, out _)
                || supported.Length == 0 || supported.Any(version => !Version.TryParse(version, out _))
                || !Version.TryParse(serverApiVersion, out _)
                || apiSupported.Length == 0 || apiSupported.Any(version => !Version.TryParse(version, out _)))
            {
                return Disabled;
            }

            return new WebCompatibilityManifest(schemaVersion, serverWebVersion!, targetAbi!, targetFramework, supported, serverApiVersion!, apiSupported);
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        {
            return Disabled;
        }
    }

    private static WebCompatibilityManifest Disabled => new(0, "unknown", "unknown", "unknown", Array.Empty<string>(), "unknown", Array.Empty<string>());

    private static WebCompatibilityManifest Load()
    {
        using var stream = typeof(WebCompatibilityManifest).Assembly.GetManifestResourceStream("LiveTvCategories.Compatibility.json");
        if (stream is null)
        {
            return Disabled;
        }

        using var reader = new StreamReader(stream);
        return Parse(reader.ReadToEnd());
    }
}
