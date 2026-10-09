using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.LiveTvCategories.Services;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.LiveTv;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Jellyfin.Plugin.LiveTvCategories.Tests;

public sealed class JellyfinLiveTvCompatibilityAdapterTests
{
    [Fact]
    public async Task CurrentUserPolicyOverridesStaleAuthorizedSessionUser()
    {
        var sessionUser = CreateUser(true);
        var currentUser = CreateUser(false);
        currentUser.Id = sessionUser.Id;
        var adapter = CreateAdapter(new AuthorizationInfo { User = sessionUser }, currentUser);
        var result = await adapter.ResolveUserAsync(new DefaultHttpContext(), null);
        Assert.Equal(CategoryUserResolutionError.Forbidden, result.Error);
        Assert.Null(result.UserId);
    }

    [Fact]
    public async Task SessionUserCannotRequestAnotherUsersCategoryCounts()
    {
        var user = CreateUser(true);
        var adapter = CreateAdapter(new AuthorizationInfo { User = user }, user);
        Assert.Equal(CategoryUserResolutionError.Forbidden,
            (await adapter.ResolveUserAsync(new DefaultHttpContext(), Guid.NewGuid())).Error);
    }

    [Fact]
    public async Task ApiKeysRequireExplicitLiveTvEnabledUserAndDeletedUsersAreRejected()
    {
        var user = CreateUser(true);
        var adapter = CreateAdapter(new AuthorizationInfo { IsApiKey = true }, user);
        Assert.Equal(CategoryUserResolutionError.UserRequired, (await adapter.ResolveUserAsync(new DefaultHttpContext(), null)).Error);
        Assert.Equal(CategoryUserResolutionError.UserRequired, (await adapter.ResolveUserAsync(new DefaultHttpContext(), Guid.Empty)).Error);
        Assert.Equal(user.Id, (await adapter.ResolveUserAsync(new DefaultHttpContext(), user.Id)).UserId);
        var missing = CreateAdapter(new AuthorizationInfo { IsApiKey = true }, null);
        Assert.Equal(CategoryUserResolutionError.UserNotFound, (await missing.ResolveUserAsync(new DefaultHttpContext(), user.Id)).Error);
    }

    [Fact]
    public async Task UnauthenticatedRequestDoesNotResolveAUser()
    {
        var adapter = CreateAdapter(new AuthorizationInfo(), null);
        Assert.Equal(CategoryUserResolutionError.Unauthenticated,
            (await adapter.ResolveUserAsync(new DefaultHttpContext(), Guid.NewGuid())).Error);
    }

    [Fact]
    public void RevokedLiveTvPermissionFailsBeforeReadingChannelsOrDtos()
    {
        var user = CreateUser(false);
        var adapter = CreateAdapter(new AuthorizationInfo { User = user }, user);
        Assert.Throws<CategoryAccessDeniedException>(() => adapter.GetVisibleChannelIds(user.Id, default));
        Assert.Throws<CategoryAccessDeniedException>(() => adapter.GetChannelDtos(user.Id, new[] { Guid.NewGuid() }, true, default));
    }

    [Fact]
    public async Task NativeSourceFailureIsSafeAndRecordedWithoutProviderDetails()
    {
        var user = CreateUser(true);
        var adapter = CreateAdapter(new AuthorizationInfo { User = user }, user);
        var exception = await Assert.ThrowsAsync<CategorySourceUnavailableException>(() => adapter.ReadCategoriesAsync(default));
        Assert.Null(exception.InnerException);
        Assert.DoesNotContain("secret", exception.Message);
        Assert.Equal("unavailable", adapter.Diagnostics.State);
        Assert.NotNull(adapter.Diagnostics.LastAttemptUtc);
    }

    [Fact]
    public void NativeVisibilityFailureIsARecoverableSafeError()
    {
        var user = CreateUser(true);
        var adapter = CreateAdapter(new AuthorizationInfo { User = user }, user);
        var exception = Assert.Throws<CategorySourceUnavailableException>(() => adapter.GetVisibleChannelIds(user.Id, default));
        Assert.Null(exception.InnerException);
        Assert.DoesNotContain("secret", exception.Message);
        Assert.Equal("unavailable", adapter.Diagnostics.State);
    }

    [Fact]
    public async Task NativeInternalTimeoutWithoutRequestCancellationIsRecoverable()
    {
        var user = CreateUser(true);
        var adapter = CreateAdapter(new AuthorizationInfo { User = user }, user, new TaskCanceledException("provider timeout with secret"));
        var visibility = Assert.Throws<CategorySourceUnavailableException>(() => adapter.GetVisibleChannelIds(user.Id, default));
        Assert.Null(visibility.InnerException);
        var metadata = await Assert.ThrowsAsync<CategorySourceUnavailableException>(() => adapter.ReadCategoriesAsync(default));
        Assert.Null(metadata.InnerException);
        Assert.DoesNotContain("secret", metadata.Message);
        Assert.Equal("unavailable", adapter.Diagnostics.State);
    }

    private static User CreateUser(bool allowLiveTv)
    {
        var user = new User("test", "test-auth", "test-reset") { Id = Guid.NewGuid() };
        user.Permissions.Clear();
        user.Permissions.Add(new Permission(PermissionKind.EnableLiveTvAccess, allowLiveTv));
        return user;
    }

    private static JellyfinLiveTvCompatibilityAdapter CreateAdapter(AuthorizationInfo authorization, User? user, Exception? channelFailure = null) => new(
        InterfaceStub<ITunerHostManager>.Create((_, _) => throw new InvalidOperationException("unexpected tuner request")),
        InterfaceStub<ILiveTvManager>.Create((_, _) => throw channelFailure ?? new IOException("provider URL contains secret")),
        InterfaceStub<IAuthorizationContext>.Create((_, _) => Task.FromResult(authorization)),
        InterfaceStub<IUserManager>.Create((method, _) => method.Name == "GetUserById" ? user : throw new InvalidOperationException("unexpected user request")),
        InterfaceStub<ILibraryManager>.Create((_, _) => throw new InvalidOperationException("unexpected library request")),
        InterfaceStub<IDtoService>.Create((_, _) => throw new InvalidOperationException("unexpected DTO request")),
        NullLogger<JellyfinLiveTvCompatibilityAdapter>.Instance);
}
