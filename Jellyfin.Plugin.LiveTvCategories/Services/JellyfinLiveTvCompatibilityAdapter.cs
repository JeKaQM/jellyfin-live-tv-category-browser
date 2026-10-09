using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.LiveTv;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.LiveTv;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.LiveTvCategories.Services;

/// <summary>
/// Contains all usage of Jellyfin's native user, tuner, channel and DTO services.
/// Source-built binaries are tested against each declared Jellyfin package version;
/// this adapter is not a promise that a single DLL will load against a future ABI.
/// </summary>
internal sealed class JellyfinLiveTvCompatibilityAdapter : ILiveTvCompatibilityAdapter
{
    private readonly ITunerHostManager _tunerHostManager;
    private readonly ILiveTvManager _liveTvManager;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;
    private readonly IDtoService _dtoService;
    private readonly ILogger<JellyfinLiveTvCompatibilityAdapter> _logger;
    private CategorySourceDiagnostics _diagnostics = new("not-yet-queried", null, 0, 0, 0, 0, 0);

    public JellyfinLiveTvCompatibilityAdapter(
        ITunerHostManager tunerHostManager,
        ILiveTvManager liveTvManager,
        IAuthorizationContext authorizationContext,
        IUserManager userManager,
        ILibraryManager libraryManager,
        IDtoService dtoService,
        ILogger<JellyfinLiveTvCompatibilityAdapter> logger)
    {
        _tunerHostManager = tunerHostManager;
        _liveTvManager = liveTvManager;
        _authorizationContext = authorizationContext;
        _userManager = userManager;
        _libraryManager = libraryManager;
        _dtoService = dtoService;
        _logger = logger;
    }

    public string AdapterName => "jellyfin-live-tv-v1";

    public CategorySourceDiagnostics Diagnostics => Volatile.Read(ref _diagnostics);

    public async Task<CategoryUserResolution> ResolveUserAsync(HttpContext context, Guid? requestedUserId)
    {
        var authorization = await _authorizationContext.GetAuthorizationInfo(context).ConfigureAwait(false);
        Guid userId;
        if (authorization.User is not null)
        {
            userId = authorization.User.Id;
            if (requestedUserId.HasValue && requestedUserId != Guid.Empty && requestedUserId != userId)
            {
                return new CategoryUserResolution(null, CategoryUserResolutionError.Forbidden);
            }
        }
        else if (authorization.IsApiKey)
        {
            if (!requestedUserId.HasValue || requestedUserId == Guid.Empty)
            {
                return new CategoryUserResolution(null, CategoryUserResolutionError.UserRequired);
            }

            userId = requestedUserId.Value;
        }
        else
        {
            return new CategoryUserResolution(null, CategoryUserResolutionError.Unauthenticated);
        }

        // Session authorization data can be older than a policy edit. Resolve the
        // current user from Jellyfin on every request before accepting the session.
        var user = _userManager.GetUserById(userId);
        if (user is null)
        {
            return new CategoryUserResolution(null, CategoryUserResolutionError.UserNotFound);
        }

        return user.HasPermission(PermissionKind.EnableLiveTvAccess)
            ? new CategoryUserResolution(user.Id, CategoryUserResolutionError.None)
            : new CategoryUserResolution(null, CategoryUserResolutionError.Forbidden);
    }

    public IReadOnlySet<Guid> GetVisibleChannelIds(Guid userId, CancellationToken cancellationToken)
        => ReadNative<IReadOnlySet<Guid>>(() =>
    {
        cancellationToken.ThrowIfCancellationRequested();
        var user = RequireLiveTvUser(userId);
        var channels = _liveTvManager.GetInternalChannels(
            CreateChannelQuery(userId),
            CreateIndexDtoOptions(),
            cancellationToken);
        var visibleIds = channels.Items
            .OfType<LiveTvChannel>()
            .Where(channel => channel.IsVisible(user))
            .Select(channel => channel.Id)
            .ToHashSet();
        cancellationToken.ThrowIfCancellationRequested();
        return visibleIds;
    }, cancellationToken);

    public IReadOnlyList<BaseItemDto> GetChannelDtos(
        Guid userId,
        IReadOnlyList<Guid> channelIds,
        bool addCurrentProgram,
        CancellationToken cancellationToken) => ReadNative<IReadOnlyList<BaseItemDto>>(() =>
    {
        var user = RequireLiveTvUser(userId);
        var visibleIds = GetVisibleChannelIds(userId, cancellationToken);
        var items = new List<BaseItem>(channelIds.Count);
        foreach (var channelId in channelIds)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (visibleIds.Contains(channelId)
                && _libraryManager.GetItemById(channelId) is LiveTvChannel channel
                && channel.IsVisible(user))
            {
                items.Add(channel);
            }
        }

        var dtos = _dtoService.GetBaseItemDtos(
            items,
            new DtoOptions(false)
            {
                EnableImages = true,
                ImageTypeLimit = 1,
                EnableUserData = true,
                AddCurrentProgram = addCurrentProgram
            },
            user,
            skipVisibilityCheck: true);
        cancellationToken.ThrowIfCancellationRequested();
        RequireLiveTvUser(userId);
        return dtos;
    }, cancellationToken);

    public async Task<CategorySourceResult> ReadCategoriesAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var attemptedAtUtc = DateTimeOffset.UtcNow;
        var eligibleCount = 0;
        try
        {
            var persistedChannels = _liveTvManager.GetInternalChannels(
                CreateChannelQuery(null),
                CreateIndexDtoOptions(),
                cancellationToken);
            var persistedByExternalId = new Dictionary<string, Guid>(StringComparer.Ordinal);
            foreach (var channel in persistedChannels.Items.OfType<LiveTvChannel>())
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!string.IsNullOrEmpty(channel.ExternalId))
                {
                    persistedByExternalId.TryAdd(channel.ExternalId, channel.Id);
                }
            }

            var readers = _tunerHostManager.TunerHosts
                .Where(host => host.IsSupported && string.Equals(host.Type, "m3u", StringComparison.OrdinalIgnoreCase))
                .Select(host => (Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>)(async token =>
                {
                    var channels = await host.GetChannels(true, token).ConfigureAwait(false);
                    return channels.Select(channel => new SourceChannel(channel.Id, channel.ChannelGroup)).ToArray();
                }))
                .ToArray();
            eligibleCount = readers.Length;
            var tunerResult = await TunerChannelReader.ReadAsync(readers, cancellationToken).ConfigureAwait(false);
            var indexed = new List<IndexedChannel>(persistedByExternalId.Count);
            var matchedIds = new HashSet<Guid>();
            var unmatched = 0;
            foreach (var channel in tunerResult.Channels)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (string.IsNullOrEmpty(channel.ExternalId)
                    || !persistedByExternalId.TryGetValue(channel.ExternalId, out var persistedId)
                    || !matchedIds.Add(persistedId))
                {
                    unmatched++;
                    continue;
                }

                indexed.Add(new IndexedChannel(persistedId, channel.GroupName));
            }

            var state = tunerResult.FailedTunerCount > 0 ? "degraded" : eligibleCount == 0 ? "no-supported-tuners" : "ready";
            Volatile.Write(ref _diagnostics, new CategorySourceDiagnostics(
                state, attemptedAtUtc, eligibleCount, tunerResult.SuccessfulTunerCount,
                tunerResult.FailedTunerCount, indexed.Count, unmatched));
            _logger.LogInformation(
                "Live TV category source: {MatchedChannelCount} matched channels, {UnmatchedChannelCount} unmatched records, {SuccessfulTunerCount} successful tuners, {FailedTunerCount} failed tuners",
                indexed.Count, unmatched, tunerResult.SuccessfulTunerCount, tunerResult.FailedTunerCount);
            return new CategorySourceResult(indexed, unmatched, eligibleCount, tunerResult.SuccessfulTunerCount, tunerResult.FailedTunerCount);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Volatile.Write(ref _diagnostics, new CategorySourceDiagnostics(
                "unavailable", attemptedAtUtc, eligibleCount, 0, eligibleCount, 0, 0));
            _logger.LogWarning("Live TV category source is unavailable; {EligibleTunerCount} eligible tuners", eligibleCount);
            throw new CategorySourceUnavailableException();
        }
    }

    private User RequireLiveTvUser(Guid userId)
    {
        var user = _userManager.GetUserById(userId);
        if (user is null || !user.HasPermission(PermissionKind.EnableLiveTvAccess))
        {
            throw new CategoryAccessDeniedException();
        }

        return user;
    }

    private T ReadNative<T>(Func<T> read, CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            return read();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (exception is not CategoryAccessDeniedException and not CategorySourceUnavailableException)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var previous = Diagnostics;
            Volatile.Write(ref _diagnostics, previous with { State = "unavailable", LastAttemptUtc = DateTimeOffset.UtcNow });
            _logger.LogWarning("Live TV category adapter could not read the current channel view");
            throw new CategorySourceUnavailableException();
        }
    }

    private static LiveTvChannelQuery CreateChannelQuery(Guid? userId) => new()
    {
        UserId = userId ?? Guid.Empty,
        EnableUserData = false,
        AddCurrentProgram = false,
        SortBy = Array.Empty<ItemSortBy>()
    };

    private static DtoOptions CreateIndexDtoOptions() => new(false)
    {
        EnableImages = false,
        EnableUserData = false,
        AddCurrentProgram = false
    };
}
