namespace Jellyfin.Plugin.LiveTvCategories.Services;

/// <summary>
/// Caches only server-wide category metadata. User visibility is intentionally read
/// on every request, so policy and channel changes cannot leave stale cached counts.
/// </summary>
internal sealed class LiveTvCategoryIndex : ILiveTvCategoryIndex, IDisposable
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan DegradedCacheDuration = TimeSpan.FromSeconds(30);
    private readonly ILiveTvCategorySource _source;
    private readonly SemaphoreSlim _buildLock = new(1, 1);
    private CachedSnapshot? _snapshot;

    public LiveTvCategoryIndex(ILiveTvCategorySource source)
    {
        _source = source;
    }

    public async Task<UserCategorySnapshot> GetForUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("A user ID is required.", nameof(userId));
        }

        cancellationToken.ThrowIfCancellationRequested();
        // Check visibility before reading a tuner or shared metadata cache. The adapter
        // also rechecks the current user policy, rather than trusting a session snapshot.
        _source.GetVisibleChannelIds(userId, cancellationToken);
        var snapshot = await GetSnapshotAsync(cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        var visibleIds = _source.GetVisibleChannelIds(userId, cancellationToken);
        return snapshot.CreateUserView(visibleIds);
    }

    public void Invalidate() => Volatile.Write(ref _snapshot, null);

    public void Dispose() => _buildLock.Dispose();

    private async Task<CategorySnapshot> GetSnapshotAsync(CancellationToken cancellationToken)
    {
        var cached = Volatile.Read(ref _snapshot);
        if (cached is not null && DateTimeOffset.UtcNow < cached.ExpiresAtUtc)
        {
            return cached.Snapshot;
        }

        await _buildLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            cached = Volatile.Read(ref _snapshot);
            if (cached is not null && DateTimeOffset.UtcNow < cached.ExpiresAtUtc)
            {
                return cached.Snapshot;
            }

            var source = await _source.ReadCategoriesAsync(cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            var now = DateTimeOffset.UtcNow;
            var snapshot = CategorySnapshotBuilder.Build(source.Channels, now, source.UnmatchedChannelCount);
            var duration = source.FailedTunerCount > 0 ? DegradedCacheDuration : CacheDuration;
            Volatile.Write(ref _snapshot, new CachedSnapshot(snapshot, now + duration));
            return snapshot;
        }
        finally
        {
            _buildLock.Release();
        }
    }

    private sealed record CachedSnapshot(CategorySnapshot Snapshot, DateTimeOffset ExpiresAtUtc);
}
