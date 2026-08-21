using System;
using Jellyfin.Plugin.LiveTvCategories.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.LiveTvCategories;

/// <summary>
/// Adds category browsing metadata to Jellyfin Live TV.
/// </summary>
public sealed class Plugin : BasePlugin<PluginConfiguration>
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Jellyfin application paths.</param>
    /// <param name="xmlSerializer">Jellyfin configuration serializer.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
    }

    /// <inheritdoc />
    public override string Name => "Live TV Categories";

    /// <inheritdoc />
    public override string Description => "Category-first browsing for Jellyfin's existing Live TV channels, with an optional bundled Web interface.";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("a4b2fdc8-cb2a-463b-812a-16e9ea88e12a");
}
