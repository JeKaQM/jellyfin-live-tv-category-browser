using Jellyfin.Plugin.LiveTvCategories.Services;
using Xunit;

namespace Jellyfin.Plugin.LiveTvCategories.Tests;

public sealed class CategorySnapshotBuilderTests
{
    [Fact]
    public void BuildGroupsChannelsAndRemovesDuplicateInternalIds()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        var snapshot = CategorySnapshotBuilder.Build(
            new[]
            {
                new IndexedChannel(first, "EU | UK GENERAL"),
                new IndexedChannel(second, "EU | UK GENERAL"),
                new IndexedChannel(first, "EU | UK GENERAL")
            },
            DateTimeOffset.UtcNow);
        var view = snapshot.CreateUserView(new HashSet<Guid> { first, second });

        var category = Assert.Single(view.Categories);
        Assert.Equal("EU | UK GENERAL", category.Name);
        Assert.Equal(2, category.ChannelCount);
    }

    [Fact]
    public void BuildPreservesUnicodeAndUsesOpaqueIds()
    {
        const string name = "EU | УКРАЇНА / Kids & Family's";
        var id = Guid.NewGuid();
        var snapshot = CategorySnapshotBuilder.Build(
            new[] { new IndexedChannel(id, name) },
            DateTimeOffset.UtcNow);
        var category = Assert.Single(snapshot.CreateUserView(new HashSet<Guid> { id }).Categories);

        Assert.Equal(name, category.Name);
        Assert.StartsWith("category-", category.Id);
        Assert.DoesNotContain(name, category.Id);
    }

    [Fact]
    public void BuildKeepsWhitespaceGroupsAsUncategorised()
    {
        var ids = new[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() };
        var snapshot = CategorySnapshotBuilder.Build(
            new[]
            {
                new IndexedChannel(ids[0], null),
                new IndexedChannel(ids[1], string.Empty),
                new IndexedChannel(ids[2], "   ")
            },
            DateTimeOffset.UtcNow);
        var category = Assert.Single(snapshot.CreateUserView(ids.ToHashSet()).Categories);

        Assert.Equal("Uncategorised", category.Name);
        Assert.Equal(3, category.ChannelCount);
        Assert.StartsWith("uncategorised-", category.Id);
    }

    [Fact]
    public void UserViewFiltersCountsAndPaginatesOnlySelectedCategory()
    {
        var ids = Enumerable.Range(0, 600).Select(_ => Guid.NewGuid()).ToArray();
        var snapshot = CategorySnapshotBuilder.Build(
            ids.Select(id => new IndexedChannel(id, "UK Sport")),
            DateTimeOffset.UtcNow);
        var visible = ids.Take(550).ToHashSet();
        var view = snapshot.CreateUserView(visible);
        var category = Assert.Single(view.Categories);

        var page = Assert.IsType<CategoryIdPage>(view.GetPage(category.Id, 250, 100));
        Assert.Equal(100, page.Items.Count);
        Assert.Equal(250, page.StartIndex);
        Assert.Equal(550, page.TotalRecordCount);
        Assert.Null(view.GetPage("missing", 0, 100));
    }

    [Fact]
    public void BuildHandlesVerifiedProviderScale()
    {
        const int channelCount = 27_740;
        const int categoryCount = 321;
        var channels = Enumerable.Range(0, channelCount)
            .Select(index => new IndexedChannel(
                Guid.NewGuid(),
                $"Category {index % categoryCount:D3}"))
            .ToArray();
        var snapshot = CategorySnapshotBuilder.Build(channels, DateTimeOffset.UtcNow);
        var view = snapshot.CreateUserView(channels.Select(channel => channel.InternalId).ToHashSet());

        Assert.Equal(categoryCount, view.Categories.Count);
        Assert.Equal(channelCount, view.Categories.Sum(category => category.ChannelCount));
    }
}
