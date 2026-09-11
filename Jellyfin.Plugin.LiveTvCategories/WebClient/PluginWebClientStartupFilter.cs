using System;
using System.IO;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using MediaBrowser.Common;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Configuration;

namespace Jellyfin.Plugin.LiveTvCategories.WebClient;

/// <summary>
/// Serves the version-matched Jellyfin Web build bundled beside the plugin assembly.
/// </summary>
public sealed class PluginWebClientStartupFilter : IStartupFilter
{
    private const string DefaultWebRequestPath = "/web";
    private static readonly Version BundledWebServerVersion = new(12, 0, 0, 0);
    private readonly IApplicationHost _applicationHost;
    private readonly ILogger<PluginWebClientStartupFilter> _logger;
    private readonly IServerConfigurationManager _serverConfigurationManager;

    public PluginWebClientStartupFilter(
        ILogger<PluginWebClientStartupFilter> logger,
        IServerConfigurationManager serverConfigurationManager,
        IApplicationHost applicationHost)
    {
        _logger = logger;
        _serverConfigurationManager = serverConfigurationManager;
        _applicationHost = applicationHost;
    }

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        ArgumentNullException.ThrowIfNull(next);

        return app =>
        {
            if (!CanServeBundledWeb(_applicationHost.ApplicationVersion))
            {
                _logger.LogWarning(
                    "Live TV Categories bundled Web is disabled because it requires Jellyfin {ExpectedVersion}, but this server is {ActualVersion}",
                    BundledWebServerVersion,
                    _applicationHost.ApplicationVersion);
                next(app);
                return;
            }

            var webRoot = ResolveBundledWebRoot();
            if (webRoot is null)
            {
                _logger.LogInformation(
                    "Live TV Categories is running API-only because no bundled Web client was found beside the plugin assembly");
                next(app);
                return;
            }

            var fileProvider = new PhysicalFileProvider(webRoot);
            var webRequestPath = WebRequestPathForBaseUrl(
                _serverConfigurationManager.GetNetworkConfiguration().BaseUrl);
            var defaultFiles = new DefaultFilesOptions
            {
                FileProvider = fileProvider,
                RequestPath = new PathString(webRequestPath)
            };
            defaultFiles.DefaultFileNames.Clear();
            defaultFiles.DefaultFileNames.Add("index.html");

            app.UseDefaultFiles(defaultFiles);
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = fileProvider,
                RequestPath = new PathString(webRequestPath),
                ContentTypeProvider = new FileExtensionContentTypeProvider(),
                OnPrepareResponse = context =>
                {
                    context.Context.Response.Headers["X-Live-TV-Categories-Web"] =
                        typeof(Plugin).Assembly.GetName().Version?.ToString() ?? "unknown";
                    context.Context.Response.Headers.CacheControl = CacheControlForFile(context.File.Name);
                }
            });

            _logger.LogInformation(
                "Live TV Categories is serving its bundled Jellyfin Web client from {WebRoot} at {WebRequestPath}",
                webRoot,
                webRequestPath);
            next(app);
        };
    }

    internal static bool CanServeBundledWeb(Version applicationVersion)
    {
        ArgumentNullException.ThrowIfNull(applicationVersion);
        return applicationVersion == BundledWebServerVersion;
    }

    internal static string WebRequestPathForBaseUrl(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl) || string.Equals(baseUrl.Trim(), "/", StringComparison.Ordinal))
        {
            return DefaultWebRequestPath;
        }

        return $"/{baseUrl.Trim().Trim('/')}{DefaultWebRequestPath}";
    }

    internal static string? ResolveBundledWebRoot()
    {
        var assemblyLocation = typeof(Plugin).Assembly.Location;
        var pluginDirectory = Path.GetDirectoryName(assemblyLocation);
        if (string.IsNullOrEmpty(pluginDirectory))
        {
            return null;
        }

        var webRoot = Path.Combine(pluginDirectory, "web");
        return File.Exists(Path.Combine(webRoot, "index.html"))
            ? webRoot
            : null;
    }

    internal static bool IsMutableShellFile(string name)
    {
        return string.Equals(name, "index.html", StringComparison.OrdinalIgnoreCase)
            || string.Equals(name, "config.json", StringComparison.OrdinalIgnoreCase)
            || string.Equals(name, "manifest.json", StringComparison.OrdinalIgnoreCase)
            || string.Equals(name, "serviceworker.js", StringComparison.OrdinalIgnoreCase);
    }

    internal static string CacheControlForFile(string name)
    {
        if (IsMutableShellFile(name))
        {
            return "no-cache, no-store, must-revalidate";
        }

        foreach (var segment in name.Split('.'))
        {
            if (segment.Length >= 8 && segment.All(char.IsAsciiHexDigit))
            {
                return "public, max-age=31536000, immutable";
            }
        }

        return "public, max-age=3600";
    }
}
