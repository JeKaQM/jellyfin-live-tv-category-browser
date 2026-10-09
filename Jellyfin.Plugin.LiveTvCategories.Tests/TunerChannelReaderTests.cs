using Jellyfin.Plugin.LiveTvCategories.Services;
using Xunit;

namespace Jellyfin.Plugin.LiveTvCategories.Tests;

public sealed class TunerChannelReaderTests
{
    [Fact]
    public async Task OneFailingTunerDoesNotDiscardHealthyChannels()
    {
        var readers = new Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>[]
        {
            _ => throw new InvalidOperationException("provider URL with credentials must not be returned"),
            _ => Task.FromResult<IReadOnlyList<SourceChannel>>(new[] { new SourceChannel("first", "News") }),
            _ => Task.FromResult<IReadOnlyList<SourceChannel>>(new[] { new SourceChannel("second", "Sport") })
        };
        var result = await TunerChannelReader.ReadAsync(readers, default);
        Assert.Equal(2, result.Channels.Count);
        Assert.Equal(3, result.EligibleTunerCount);
        Assert.Equal(2, result.SuccessfulTunerCount);
        Assert.Equal(1, result.FailedTunerCount);
    }

    [Fact]
    public async Task AllFailedTunersProduceExplicitUnavailableWithoutSecrets()
    {
        var readers = new Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>[]
        {
            _ => throw new IOException("https://provider.invalid?api_key=secret"),
            _ => throw new InvalidOperationException("secret")
        };
        var exception = await Assert.ThrowsAsync<CategorySourceUnavailableException>(() => TunerChannelReader.ReadAsync(readers, default));
        Assert.Null(exception.InnerException);
        Assert.DoesNotContain("secret", exception.Message);
        Assert.DoesNotContain("https", exception.Message);
    }

    [Fact]
    public async Task NoEligibleTunersAndHealthyEmptyTunersAreLegitimateEmptyResults()
    {
        var empty = await TunerChannelReader.ReadAsync(Array.Empty<Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>>(), default);
        Assert.Empty(empty.Channels);
        Assert.Equal(0, empty.EligibleTunerCount);
        var healthy = await TunerChannelReader.ReadAsync(new Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>[]
        {
            _ => Task.FromResult<IReadOnlyList<SourceChannel>>(Array.Empty<SourceChannel>())
        }, default);
        Assert.Empty(healthy.Channels);
        Assert.Equal(1, healthy.SuccessfulTunerCount);
        Assert.Equal(0, healthy.FailedTunerCount);
    }

    [Fact]
    public async Task CancellationIsNeverConvertedIntoADegradedOrEmptyResponse()
    {
        using var cancellation = new CancellationTokenSource();
        var calledSecond = false;
        var readers = new Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>[]
        {
            _ =>
            {
                cancellation.Cancel();
                throw new OperationCanceledException(cancellation.Token);
            },
            _ =>
            {
                calledSecond = true;
                return Task.FromResult<IReadOnlyList<SourceChannel>>(Array.Empty<SourceChannel>());
            }
        };
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => TunerChannelReader.ReadAsync(readers, cancellation.Token));
        Assert.False(calledSecond);
    }

    [Fact]
    public async Task ProviderTimeoutWithoutRequestCancellationKeepsHealthyTunerData()
    {
        var result = await TunerChannelReader.ReadAsync(
            new Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>[]
            {
                _ => Task.FromException<IReadOnlyList<SourceChannel>>(new TaskCanceledException("provider timeout")),
                _ => Task.FromResult<IReadOnlyList<SourceChannel>>(new[] { new SourceChannel("healthy", "News") })
            }, default);
        Assert.Equal("healthy", Assert.Single(result.Channels).ExternalId);
        Assert.Equal(1, result.SuccessfulTunerCount);
        Assert.Equal(1, result.FailedTunerCount);
    }

    [Fact]
    public async Task AllProviderTimeoutsReturnUnavailableRatherThanCallerCancellation()
    {
        var exception = await Assert.ThrowsAsync<CategorySourceUnavailableException>(() => TunerChannelReader.ReadAsync(
            new Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>[]
            {
                _ => Task.FromException<IReadOnlyList<SourceChannel>>(new TaskCanceledException("https://provider.invalid?key=secret")),
                _ => throw new OperationCanceledException("provider timeout")
            }, default));
        Assert.Null(exception.InnerException);
        Assert.DoesNotContain("secret", exception.Message);
    }
}
