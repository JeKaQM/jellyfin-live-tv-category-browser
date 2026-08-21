using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.LiveTvCategories.Models;

/// <summary>
/// A safe category summary containing no tuner or stream details.
/// </summary>
public sealed class LiveTvCategorySummary
{
    /// <summary>
    /// Initializes a new instance of the <see cref="LiveTvCategorySummary"/> class.
    /// </summary>
    /// <param name="id">Opaque deterministic category identifier.</param>
    /// <param name="name">Provider-supplied category display name.</param>
    /// <param name="channelCount">Number of visible channels in the category.</param>
    public LiveTvCategorySummary(string id, string name, int channelCount)
    {
        Id = id;
        Name = name;
        ChannelCount = channelCount;
    }

    /// <summary>
    /// Gets the opaque deterministic category identifier.
    /// </summary>
    [JsonPropertyName("id")]
    public string Id { get; }

    /// <summary>
    /// Gets the exact provider-supplied display name.
    /// </summary>
    [JsonPropertyName("name")]
    public string Name { get; }

    /// <summary>
    /// Gets the number of channels visible to the requesting user.
    /// </summary>
    [JsonPropertyName("channelCount")]
    public int ChannelCount { get; }
}
