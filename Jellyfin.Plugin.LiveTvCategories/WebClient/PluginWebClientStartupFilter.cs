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
/// Serves the bundled Jellyfin Web build on tested versions or after an administrator opts in.
/// </summary>
public sealed class PluginWebClientStartupFilter : IStartupFilter
{
    private const string DefaultWebRequestPath = "/web";
    private readonly IApplicationHost _applicationHost;
    private readonly ILogger<PluginWebClientStartupFilter> _logger;
    private readonly IServerConfigurationManager _serverConfigurationManager;
    private int _lastBundledWebMode = -1;

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
            ConfigureIndependentUi(app);
            if (WebCompatibilityManifest.Current.SchemaVersion != 1)
            {
                _logger.LogWarning(
                    "Live TV Categories bundled Web is disabled because its compatibility declaration is invalid; the version override cannot bypass this requirement");
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

            // Evaluate the saved preference on each request so saving the setting
            // can enable or disable the interface without restarting Jellyfin.
            app.UseWhen(_ =>
            {
                var state = GetCurrentBundledWebState(_applicationHost.ApplicationVersion);
                LogBundledWebState(state, webRequestPath);
                return state.Enabled;
            }, branch =>
            {
                branch.UseDefaultFiles(defaultFiles);
                branch.UseStaticFiles(new StaticFileOptions
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
            });

            LogBundledWebState(GetCurrentBundledWebState(_applicationHost.ApplicationVersion), webRequestPath);
            next(app);
        };
    }

    internal static bool CanServeBundledWeb(
        Version applicationVersion,
        bool allowUntestedServerVersions = false,
        WebCompatibilityManifest? manifest = null)
    {
        ArgumentNullException.ThrowIfNull(applicationVersion);
        manifest ??= WebCompatibilityManifest.Current;
        return manifest.SchemaVersion == 1
            && (allowUntestedServerVersions || IsTestedServerVersion(applicationVersion, manifest));
    }

    internal static bool IsTestedServerVersion(Version applicationVersion, WebCompatibilityManifest? manifest = null) =>
        (manifest ?? WebCompatibilityManifest.Current).SupportedServerVersions
            .Any(version => Version.TryParse(version, out var supported) && applicationVersion == supported);

    internal static BundledWebState GetBundledWebState(
        Version applicationVersion,
        bool allowUntestedServerVersions,
        bool hasBundledWebAssets,
        WebCompatibilityManifest? manifest = null)
    {
        var enabled = hasBundledWebAssets && CanServeBundledWeb(applicationVersion, allowUntestedServerVersions, manifest);
        return new BundledWebState(
            enabled,
            allowUntestedServerVersions,
            enabled && allowUntestedServerVersions && !IsTestedServerVersion(applicationVersion, manifest));
    }

    internal static BundledWebState GetCurrentBundledWebState(Version applicationVersion) =>
        GetBundledWebState(
            applicationVersion,
            Plugin.Instance?.Configuration.AllowUntestedServerVersions == true,
            ResolveBundledWebRoot() is not null);

    private void LogBundledWebState(BundledWebState state, string webRequestPath)
    {
        var mode = state.VersionOverrideActive ? 2 : state.Enabled ? 1 : 0;
        if (Interlocked.Exchange(ref _lastBundledWebMode, mode) == mode)
        {
            return;
        }

        if (state.VersionOverrideActive)
        {
            _logger.LogWarning(
                "Live TV Categories administrator override is serving bundled Web {WebVersion} on untested Jellyfin {ActualVersion} at {WebRequestPath}. Compatibility is not established; the older bundled interface can break or omit newer Web fixes. Disable AllowUntestedServerVersions to restore the version guard",
                WebCompatibilityManifest.Current.ServerWebVersion,
                _applicationHost.ApplicationVersion,
                webRequestPath);
        }
        else if (state.Enabled)
        {
            _logger.LogInformation(
                "Live TV Categories is serving its bundled Jellyfin Web client on tested Jellyfin {ActualVersion} at {WebRequestPath}",
                _applicationHost.ApplicationVersion,
                webRequestPath);
        }
        else
        {
            _logger.LogWarning(
                "Live TV Categories bundled Web is disabled on Jellyfin {ActualVersion}; tested versions are {ExpectedVersions}. Administrators can explicitly accept the risks in the plugin settings to override the version restriction",
                _applicationHost.ApplicationVersion,
                string.Join(", ", WebCompatibilityManifest.Current.SupportedServerVersions));
        }
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

    internal static string IndependentUiRequestPathForBaseUrl(string? baseUrl)
    {
        var webPath = WebRequestPathForBaseUrl(baseUrl);
        return webPath[..^DefaultWebRequestPath.Length] + "/LiveTvCategories/ui";
    }

    internal static string? ResolveIndependentUiRoot()
    {
        var pluginDirectory = Path.GetDirectoryName(typeof(Plugin).Assembly.Location);
        if (string.IsNullOrEmpty(pluginDirectory))
        {
            return null;
        }

        var root = Path.Combine(pluginDirectory, "category-browser");
        return File.Exists(Path.Combine(root, "index.html")) ? root : null;
    }

    private void ConfigureIndependentUi(IApplicationBuilder app)
    {
        var root = ResolveIndependentUiRoot();
        if (root is null)
        {
            return;
        }

        var requestPath = IndependentUiRequestPathForBaseUrl(
            _serverConfigurationManager.GetNetworkConfiguration().BaseUrl);
        app.Use(async (context, nextMiddleware) =>
        {
            if (context.Request.Path.Equals(new PathString(requestPath))
                && (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method)))
            {
                context.Response.Redirect(requestPath + "/" + context.Request.QueryString);
                return;
            }

            await nextMiddleware(context).ConfigureAwait(false);
        });

        var fileProvider = new PhysicalFileProvider(root);
        var defaults = new DefaultFilesOptions
        {
            FileProvider = fileProvider,
            RequestPath = new PathString(requestPath)
        };
        defaults.DefaultFileNames.Clear();
        defaults.DefaultFileNames.Add("index.html");
        app.UseDefaultFiles(defaults);
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = fileProvider,
            RequestPath = new PathString(requestPath),
            OnPrepareResponse = context =>
            {
                // Stable asset names: never leave old code cached through an upgrade.
                context.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
                context.Context.Response.Headers["X-Live-TV-Categories-UI"] =
                    typeof(Plugin).Assembly.GetName().Version?.ToString() ?? "unknown";
                context.Context.Response.Headers["X-Content-Type-Options"] = "nosniff";
                context.Context.Response.Headers["Referrer-Policy"] = "same-origin";
                context.Context.Response.Headers["Content-Security-Policy"] =
                    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
            }
        });
        _logger.LogInformation("Live TV Categories independent browser is available at {RequestPath}", requestPath);
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

internal readonly record struct BundledWebState(bool Enabled, bool VersionOverrideEnabled, bool VersionOverrideActive);
