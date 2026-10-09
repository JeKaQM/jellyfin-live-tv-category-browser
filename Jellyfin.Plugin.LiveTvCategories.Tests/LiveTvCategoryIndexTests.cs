using Jellyfin.Plugin.LiveTvCategories.Services;
using Xunit;

namespace Jellyfin.Plugin.LiveTvCategories.Tests;

public sealed class LiveTvCategoryIndexTests
{
    [Fact]
    public async Task MetadataIsSharedButVisibilityAndCountsAreNeverCached()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        var source = new TestCategorySource(new[] { new IndexedChannel(first, "News"), new IndexedChannel(second, "News") });
        using var index = new LiveTvCategoryIndex(source);
        source.Visible = new HashSet<Guid> { first, second };
        Assert.Equal(2, Assert.Single((await index.GetForUserAsync(Guid.NewGuid(), default)).Categories).ChannelCount);
        source.Visible = new HashSet<Guid> { second };
        Assert.Equal(1, Assert.Single((await index.GetForUserAsync(Guid.NewGuid(), default)).Categories).ChannelCount);
        source.Visible = new HashSet<Guid>();
        Assert.Empty((await index.GetForUserAsync(Guid.NewGuid(), default)).Categories);
        Assert.Equal(1, source.ReadCount);
        Assert.Equal(6, source.VisibilityReadCount);
    }

    [Fact]
    public async Task RevokedAccessCannotReusePreviouslyCachedCategories()
    {
        var id = Guid.NewGuid();
        var source = new TestCategorySource(new[] { new IndexedChannel(id, "Restricted") });
        using var index = new LiveTvCategoryIndex(source);
        var userId = Guid.NewGuid();
        Assert.Single((await index.GetForUserAsync(userId, default)).Categories);
        source.DenyAccess = true;
        await Assert.ThrowsAsync<CategoryAccessDeniedException>(() => index.GetForUserAsync(userId, default));
        Assert.Equal(1, source.ReadCount);
    }

    [Fact]
    public async Task VisibilityIsRecheckedAfterSlowMetadataRead()
    {
        var id = Guid.NewGuid();
        var source = new TestCategorySource(new[] { new IndexedChannel(id, "Private") });
        source.OnRead = () => source.Visible = new HashSet<Guid>();
        using var index = new LiveTvCategoryIndex(source);
        Assert.Empty((await index.GetForUserAsync(Guid.NewGuid(), default)).Categories);
    }

    [Fact]
    public async Task FailureIsNotCachedAsAnEmptySuccessfulResponse()
    {
        var id = Guid.NewGuid();
        var source = new TestCategorySource(new[] { new IndexedChannel(id, "News") }) { FailRead = true };
        using var index = new LiveTvCategoryIndex(source);
        await Assert.ThrowsAsync<CategorySourceUnavailableException>(() => index.GetForUserAsync(Guid.NewGuid(), default));
        source.FailRead = false;
        Assert.Single((await index.GetForUserAsync(Guid.NewGuid(), default)).Categories);
        Assert.Equal(2, source.ReadCount);
    }

    [Fact]
    public async Task InvalidationRebuildsMetadataAndCancellationNeverReadsSource()
    {
        var id = Guid.NewGuid();
        var source = new TestCategorySource(new[] { new IndexedChannel(id, "News") });
        using var index = new LiveTvCategoryIndex(source);
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => index.GetForUserAsync(Guid.NewGuid(), cancelled.Token));
        Assert.Equal(0, source.ReadCount);
        await index.GetForUserAsync(Guid.NewGuid(), default);
        index.Invalidate();
        await index.GetForUserAsync(Guid.NewGuid(), default);
        Assert.Equal(2, source.ReadCount);
    }

    internal sealed class TestCategorySource : ILiveTvCategorySource
    {
        private readonly IReadOnlyList<IndexedChannel> _channels;

        public TestCategorySource(IReadOnlyList<IndexedChannel> channels)
        {
            _channels = channels;
            Visible = channels.Select(channel => channel.InternalId).ToHashSet();
        }

        public IReadOnlySet<Guid> Visible { get; set; }

        public bool DenyAccess { get; set; }

        public bool FailRead { get; set; }

        public int ReadCount { get; private set; }

        public int VisibilityReadCount { get; private set; }

        public Action? OnRead { get; set; }

        public Task<CategorySourceResult> ReadCategoriesAsync(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            ReadCount++;
            OnRead?.Invoke();
            if (FailRead)
            {
                throw new CategorySourceUnavailableException();
            }

            return Task.FromResult(new CategorySourceResult(_channels, 0, 1, 1, 0));
        }

        public IReadOnlySet<Guid> GetVisibleChannelIds(Guid userId, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            VisibilityReadCount++;
            if (DenyAccess)
            {
                throw new CategoryAccessDeniedException();
            }

            return Visible;
        }
    }
}
