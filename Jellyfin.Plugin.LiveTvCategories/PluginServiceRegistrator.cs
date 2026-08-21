using Jellyfin.Plugin.LiveTvCategories.Services;
using Jellyfin.Plugin.LiveTvCategories.WebClient;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.LiveTvCategories;

/// <summary>
/// Registers the category index as one shared, short-lived cache.
/// </summary>
public sealed class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<ILiveTvCategoryIndex, LiveTvCategoryIndex>();
        serviceCollection.AddSingleton<IStartupFilter, PluginWebClientStartupFilter>();
    }
}
