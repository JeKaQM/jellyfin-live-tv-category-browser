namespace Jellyfin.Plugin.LiveTvCategories.Services;

internal sealed record SourceChannel(string? ExternalId, string? GroupName);

internal sealed record TunerReadResult(
    IReadOnlyList<SourceChannel> Channels,
    int EligibleTunerCount,
    int SuccessfulTunerCount,
    int FailedTunerCount);

/// <summary>
/// Handles partial tuner failures without exposing upstream exception messages,
/// which may contain a provider URL or credentials. Request cancellation propagates;
/// an upstream provider's private timeout is an ordinary tuner failure.
/// </summary>
internal static class TunerChannelReader
{
    public static async Task<TunerReadResult> ReadAsync(
        IReadOnlyList<Func<CancellationToken, Task<IReadOnlyList<SourceChannel>>>> readers,
        CancellationToken cancellationToken)
    {
        var channels = new List<SourceChannel>();
        var successful = 0;
        var failed = 0;
        foreach (var read in readers)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var result = await read(cancellationToken).ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
                channels.AddRange(result);
                successful++;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception)
            {
                cancellationToken.ThrowIfCancellationRequested();
                failed++;
            }
        }

        cancellationToken.ThrowIfCancellationRequested();
        if (readers.Count > 0 && successful == 0)
        {
            throw new CategorySourceUnavailableException();
        }

        return new TunerReadResult(channels, readers.Count, successful, failed);
    }
}
