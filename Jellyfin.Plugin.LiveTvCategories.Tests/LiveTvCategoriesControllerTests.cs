using System.Reflection;
using System.Text.Json;
using Jellyfin.Extensions.Json;
using Jellyfin.Plugin.LiveTvCategories.Controllers;
using Jellyfin.Plugin.LiveTvCategories.Services;
using Jellyfin.Plugin.LiveTvCategories.WebClient;
using MediaBrowser.Common;
using MediaBrowser.Common.Api;
using MediaBrowser.Model.Dto;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Jellyfin.Plugin.LiveTvCategories.Tests;

public sealed class LiveTvCategoriesControllerTests
{
    [Theory]
    [InlineData(CategoryUserResolutionError.Unauthenticated, typeof(UnauthorizedResult))]
    [InlineData(CategoryUserResolutionError.UserRequired, typeof(BadRequestObjectResult))]
    [InlineData(CategoryUserResolutionError.UserNotFound, typeof(NotFoundResult))]
    [InlineData(CategoryUserResolutionError.Forbidden, typeof(ForbidResult))]
    public async Task FailedUserResolutionNeverReadsCategoryData(CategoryUserResolutionError error, Type resultType)
    {
        var source = new LiveTvCategoryIndexTests.TestCategorySource(Array.Empty<IndexedChannel>());
        using var index = new LiveTvCategoryIndex(source);
        var adapter = new FakeAdapter { Resolution = new(null, error) };
        var controller = CreateController(index, adapter);
        var result = await controller.GetCategories(null, default);
        Assert.IsType(resultType, result.Result);
        Assert.Equal(0, source.ReadCount);
        Assert.Equal(0, source.VisibilityReadCount);
    }

    [Fact]
    public async Task UnavailableSourcesReturnRetryable503RatherThanEmpty200()
    {
        var source = new LiveTvCategoryIndexTests.TestCategorySource(Array.Empty<IndexedChannel>()) { FailRead = true };
        using var index = new LiveTvCategoryIndex(source);
        var controller = CreateController(index, new FakeAdapter());
        var response = Assert.IsType<ObjectResult>((await controller.GetCategories(null, default)).Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, response.StatusCode);
        Assert.Equal("30", controller.Response.Headers.RetryAfter);
        var problem = Assert.IsType<ProblemDetails>(response.Value);
        Assert.Contains("Normal Jellyfin", problem.Detail);
    }

    [Fact]
    public async Task PermissionRevocationDuringARequestReturnsForbidden()
    {
        var source = new LiveTvCategoryIndexTests.TestCategorySource(Array.Empty<IndexedChannel>()) { DenyAccess = true };
        using var index = new LiveTvCategoryIndex(source);
        Assert.IsType<ForbidResult>((await CreateController(index, new FakeAdapter()).GetCategories(null, default)).Result);
    }

    [Fact]
    public async Task PagingPassesOnlyRequestedIdsToDtoAdapterAndPreservesTotals()
    {
        var ids = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToArray();
        var source = new LiveTvCategoryIndexTests.TestCategorySource(ids.Select(id => new IndexedChannel(id, "News")).ToArray());
        using var index = new LiveTvCategoryIndex(source);
        var adapter = new FakeAdapter();
        var controller = CreateController(index, adapter);
        var category = Assert.Single((await index.GetForUserAsync(adapter.Resolution.UserId!.Value, default)).Categories);
        var response = await controller.GetCategoryChannels(category.Id, null, 2, 2, false);
        Assert.Equal(ids.Skip(2).Take(2), adapter.LastDtoIds);
        Assert.False(adapter.LastAddCurrentProgram);
        Assert.NotNull(response.Value);
        Assert.Equal(5, response.Value.TotalRecordCount);
        Assert.Equal(2, response.Value.StartIndex);
        Assert.Equal(2, response.Value.Items.Count);
    }

    [Theory]
    [InlineData(-1, 10)]
    [InlineData(0, 0)]
    [InlineData(0, 251)]
    public async Task InvalidPagingDoesNotReadTheCategorySource(int startIndex, int limit)
    {
        var source = new LiveTvCategoryIndexTests.TestCategorySource(Array.Empty<IndexedChannel>());
        using var index = new LiveTvCategoryIndex(source);
        var response = await CreateController(index, new FakeAdapter()).GetCategoryChannels("anything", null, startIndex, limit);
        Assert.IsType<BadRequestResult>(response.Result);
        Assert.Equal(0, source.ReadCount);
    }

    [Fact]
    public void CompatibilityRequiresAuthenticationAndDetailedDiagnosticsRequireElevation()
    {
        Assert.Equal(Policies.LiveTvAccess, typeof(LiveTvCategoryCompatibilityController).GetCustomAttribute<AuthorizeAttribute>()!.Policy);
        Assert.Equal(Policies.RequiresElevation,
            typeof(LiveTvCategoryCompatibilityController).GetMethod(nameof(LiveTvCategoryCompatibilityController.GetDiagnostics))!
                .GetCustomAttribute<AuthorizeAttribute>()!.Policy);
        Assert.Equal(Policies.LiveTvAccess, typeof(LiveTvCategoriesController).GetCustomAttribute<AuthorizeAttribute>()!.Policy);
    }

    [Fact]
    public void CompatibilityReportsSafeContractAndDoesNotContainChannelDataOrProviderSecrets()
    {
        var manifest = WebCompatibilityManifest.Current;
        var version = Version.Parse(manifest.ApiSupportedServerVersions.Last());
        var host = InterfaceStub<IApplicationHost>.Create((method, _) => method.Name == "get_ApplicationVersion" ? version : null);
        var response = new LiveTvCategoryCompatibilityController(new FakeAdapter(), host).GetCompatibility().Value!;
        Assert.Equal("1", response.ApiContractVersion);
        Assert.Equal(version.ToString(), response.ServerVersion);
        Assert.Equal(manifest.ServerApiVersion, response.ApiBaselineVersion);
        Assert.Equal($"{version.Major}.x", response.ApiCompatibilityFamily);
        Assert.True(response.ApiServerVersionTested);
        Assert.Equal(manifest.ApiSupportedServerVersions, response.ApiTestedServerVersions);
        Assert.Equal(manifest.SupportedServerVersions, response.BundledWebSupportedServerVersions);
        Assert.False(response.BundledWebVersionOverrideEnabled);
        Assert.False(response.BundledWebVersionOverrideActive);
        Assert.Contains("independentUi", response.Features);
        var names = typeof(LiveTvCategoryCompatibility).GetProperties().Select(property => property.Name).ToArray();
        Assert.DoesNotContain(names, name => name.Contains("Token") || name.Contains("Url") || name.Contains("ChannelCount"));
    }

    [Fact]
    public void CompatibilityWireNamesStayStableWithBothActualJellyfinSerializerProfiles()
    {
        var manifest = WebCompatibilityManifest.Current;
        var version = Version.Parse(manifest.ApiSupportedServerVersions.Last());
        var host = InterfaceStub<IApplicationHost>.Create((method, _) => method.Name == "get_ApplicationVersion" ? version : null);
        var controller = new LiveTvCategoryCompatibilityController(new FakeAdapter(), host);
        foreach (var options in new[] { JsonDefaults.PascalCaseOptions, JsonDefaults.CamelCaseOptions })
        {
            using var json = JsonDocument.Parse(JsonSerializer.Serialize(controller.GetCompatibility().Value, options));
            Assert.Equal("1", json.RootElement.GetProperty("apiContractVersion").GetString());
            Assert.Equal(version.ToString(), json.RootElement.GetProperty("serverVersion").GetString());
            Assert.Equal(manifest.ServerApiVersion, json.RootElement.GetProperty("apiBaselineVersion").GetString());
            Assert.Equal($"{version.Major}.x", json.RootElement.GetProperty("apiCompatibilityFamily").GetString());
            Assert.True(json.RootElement.GetProperty("apiServerVersionTested").GetBoolean());
            Assert.Equal(manifest.ApiSupportedServerVersions.Count, json.RootElement.GetProperty("apiTestedServerVersions").GetArrayLength());
            Assert.True(json.RootElement.TryGetProperty("bundledWebEnabled", out _));
            Assert.False(json.RootElement.GetProperty("bundledWebVersionOverrideEnabled").GetBoolean());
            Assert.False(json.RootElement.GetProperty("bundledWebVersionOverrideActive").GetBoolean());
            Assert.Equal(JsonValueKind.Array, json.RootElement.GetProperty("features").ValueKind);
            Assert.False(json.RootElement.TryGetProperty("ApiContractVersion", out _));
            using var diagnostics = JsonDocument.Parse(JsonSerializer.Serialize(controller.GetDiagnostics().Value, options));
            Assert.Equal("ready", diagnostics.RootElement.GetProperty("state").GetString());
            Assert.Equal(1, diagnostics.RootElement.GetProperty("eligibleTunerCount").GetInt32());
            Assert.False(diagnostics.RootElement.TryGetProperty("State", out _));
        }
    }

    public static IEnumerable<object[]> ApiVersionCases()
    {
        var versions = WebCompatibilityManifest.Current.ApiSupportedServerVersions.Select(Version.Parse).ToArray();
        foreach (var version in versions) yield return new object[] { version.ToString(), true };
        var highest = versions.Max()!;
        yield return new object[] { new Version(highest.Major, highest.Minor + 1, 0, 0).ToString(), false };
        yield return new object[] { new Version(highest.Major + 1, 0, 0, 0).ToString(), false };
    }

    [Theory]
    [MemberData(nameof(ApiVersionCases))]
    public void ApiCompatibilityReportsOnlyProvenVersionsNotEveryVersionInTheFamily(string version, bool tested)
    {
        var host = InterfaceStub<IApplicationHost>.Create((method, _) => method.Name == "get_ApplicationVersion" ? Version.Parse(version) : null);
        var response = new LiveTvCategoryCompatibilityController(new FakeAdapter(), host).GetCompatibility().Value!;
        Assert.Equal(tested, response.ApiServerVersionTested);
        Assert.Equal($"{Version.Parse(WebCompatibilityManifest.Current.ServerApiVersion).Major}.x", response.ApiCompatibilityFamily);
        if (!tested) Assert.DoesNotContain(version, response.ApiTestedServerVersions);
    }

    private static LiveTvCategoriesController CreateController(ILiveTvCategoryIndex index, FakeAdapter adapter) => new(index, adapter)
    {
        ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
    };

    private sealed class FakeAdapter : ILiveTvCompatibilityAdapter
    {
        public CategoryUserResolution Resolution { get; set; } = new(Guid.NewGuid(), CategoryUserResolutionError.None);

        public IReadOnlyList<Guid> LastDtoIds { get; private set; } = Array.Empty<Guid>();

        public bool LastAddCurrentProgram { get; private set; }

        public string AdapterName => "test-adapter";

        public CategorySourceDiagnostics Diagnostics => new("ready", null, 1, 1, 0, 5, 0);

        public Task<CategoryUserResolution> ResolveUserAsync(HttpContext context, Guid? requestedUserId) => Task.FromResult(Resolution);

        public IReadOnlyList<BaseItemDto> GetChannelDtos(Guid userId, IReadOnlyList<Guid> channelIds, bool addCurrentProgram, CancellationToken cancellationToken)
        {
            LastDtoIds = channelIds;
            LastAddCurrentProgram = addCurrentProgram;
            return channelIds.Select(id => new BaseItemDto { Id = id }).ToArray();
        }

        public Task<CategorySourceResult> ReadCategoriesAsync(CancellationToken cancellationToken) => throw new NotSupportedException();

        public IReadOnlySet<Guid> GetVisibleChannelIds(Guid userId, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}

public class InterfaceStub<T> : DispatchProxy
    where T : class
{
    private Func<MethodInfo, object?[]?, object?>? _invoke;

    public static T Create(Func<MethodInfo, object?[]?, object?> invoke)
    {
        var instance = Create<T, InterfaceStub<T>>();
        ((InterfaceStub<T>)(object)instance)._invoke = invoke;
        return instance;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => _invoke!(targetMethod!, args);
}
