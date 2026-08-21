using System;
using System.IO;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.LiveTvCategories.WebClient;

/// <summary>
/// Serves the version-matched Jellyfin Web build bundled beside the plugin assembly.
/// </summary>
public sealed class PluginWebClientStartupFilter : IStartupFilter
{
    private const string WebRequestPath = "/web";
    private readonly ILogger<PluginWebClientStartupFilter> _logger;

    public PluginWebClientStartupFilter(ILogger<PluginWebClientStartupFilter> logger)
    {
        _logger = logger;
    }

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        ArgumentNullException.ThrowIfNull(next);

        return app =>
        {
            var webRoot = ResolveBundledWebRoot();
            if (webRoot is null)
            {
                _logger.LogInformation(
                    "Live TV Categories is running API-only because no bundled Web client was found beside the plugin assembly");
                next(app);
                return;
            }

            var fileProvider = new PhysicalFileProvider(webRoot);
            var defaultFiles = new DefaultFilesOptions
            {
                FileProvider = fileProvider,
                RequestPath = new PathString(WebRequestPath)
            };
            defaultFiles.DefaultFileNames.Clear();
            defaultFiles.DefaultFileNames.Add("index.html");

            app.UseDefaultFiles(defaultFiles);
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = fileProvider,
                RequestPath = new PathString(WebRequestPath),
                ContentTypeProvider = new FileExtensionContentTypeProvider(),
                OnPrepareResponse = context =>
                {
                    context.Context.Response.Headers["X-Live-TV-Categories-Web"] = "0.2.0.0";
                    context.Context.Response.Headers.CacheControl = CacheControlForFile(context.File.Name);
                }
            });

            _logger.LogInformation(
                "Live TV Categories is serving its bundled Jellyfin Web client from {WebRoot}",
                webRoot);
            next(app);
        };
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
