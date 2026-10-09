using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using MediaBrowser.Model.Dto;

namespace Jellyfin.Plugin.LiveTvCategories.Services;

/// <summary>
/// The boundary between the category feature and Jellyfin's version-dependent APIs.
/// Implement a new adapter here when an upstream contract changes; category grouping
/// and permission-aware caching must not depend on Jellyfin entities or tuner internals.
/// </summary>
public interface ILiveTvCompatibilityAdapter : ILiveTvCategorySource
{
    string AdapterName { get; }

    CategorySourceDiagnostics Diagnostics { get; }

    Task<CategoryUserResolution> ResolveUserAsync(HttpContext context, Guid? requestedUserId);

    IReadOnlyList<BaseItemDto> GetChannelDtos(
        Guid userId,
        IReadOnlyList<Guid> channelIds,
        bool addCurrentProgram,
        CancellationToken cancellationToken);
}

public interface ILiveTvCategorySource
{
    Task<CategorySourceResult> ReadCategoriesAsync(CancellationToken cancellationToken);

    IReadOnlySet<Guid> GetVisibleChannelIds(Guid userId, CancellationToken cancellationToken);
}

public sealed record CategorySourceResult(
    IReadOnlyList<IndexedChannel> Channels,
    int UnmatchedChannelCount,
    int EligibleTunerCount,
    int SuccessfulTunerCount,
    int FailedTunerCount);

public sealed record CategorySourceDiagnostics(
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("lastAttemptUtc")] DateTimeOffset? LastAttemptUtc,
    [property: JsonPropertyName("eligibleTunerCount")] int EligibleTunerCount,
    [property: JsonPropertyName("successfulTunerCount")] int SuccessfulTunerCount,
    [property: JsonPropertyName("failedTunerCount")] int FailedTunerCount,
    [property: JsonPropertyName("matchedChannelCount")] int MatchedChannelCount,
    [property: JsonPropertyName("unmatchedChannelCount")] int UnmatchedChannelCount);

public enum CategoryUserResolutionError
{
    None,
    Unauthenticated,
    UserRequired,
    UserNotFound,
    Forbidden
}

public sealed record CategoryUserResolution(Guid? UserId, CategoryUserResolutionError Error);

public sealed class CategorySourceUnavailableException : Exception
{
    public CategorySourceUnavailableException()
        : base("The Live TV category source is temporarily unavailable.")
    {
    }
}

public sealed class CategoryAccessDeniedException : Exception
{
    public CategoryAccessDeniedException()
        : base("Live TV access is not permitted for this user.")
    {
    }
}
