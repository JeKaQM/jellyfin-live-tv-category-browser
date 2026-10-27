using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.LiveTvCategories.Configuration;

/// <summary>
/// Administrator preferences persisted through Jellyfin's plugin settings.
/// </summary>
public sealed class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Allows the bundled Web interface on an untested server version at the
    /// administrator's risk. This does not bypass authentication or API requirements.
    /// </summary>
    public bool AllowUntestedServerVersions { get; set; }
}
