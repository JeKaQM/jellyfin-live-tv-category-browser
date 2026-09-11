using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Net.Mime;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.LiveTvCategories.Models;
using Jellyfin.Plugin.LiveTvCategories.Services;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.LiveTv;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.LiveTvCategories.Controllers;

/// <summary>
/// Provides a summary-first category view over existing Jellyfin Live TV channels.
/// </summary>
[ApiController]
[Authorize(Policy = Policies.LiveTvAccess)]
[Route("LiveTvCategories")]
[Produces(MediaTypeNames.Application.Json)]
public sealed class LiveTvCategoriesController : ControllerBase
{
    private readonly ILiveTvCategoryIndex _categoryIndex;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;
    private readonly IDtoService _dtoService;

    public LiveTvCategoriesController(
        ILiveTvCategoryIndex categoryIndex,
        IAuthorizationContext authorizationContext,
        IUserManager userManager,
        ILibraryManager libraryManager,
        IDtoService dtoService)
    {
        _categoryIndex = categoryIndex;
        _authorizationContext = authorizationContext;
        _userManager = userManager;
        _libraryManager = libraryManager;
        _dtoService = dtoService;
    }

    /// <summary>
    /// Gets dynamic category summaries for the current Live TV user.
    /// </summary>
    /// <param name="userId">Required only when authenticating with an administrator API key.</param>
    /// <param name="cancellationToken">Request cancellation token.</param>
    /// <returns>Small category summaries containing no channel or stream data.</returns>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<IReadOnlyList<LiveTvCategorySummary>>> GetCategories(
        [FromQuery] Guid? userId,
        CancellationToken cancellationToken)
    {
        var resolution = await ResolveUserAsync(userId).ConfigureAwait(false);
        if (resolution.Error is not null)
        {
            return resolution.Error;
        }

        var snapshot = await _categoryIndex.GetForUserAsync(resolution.User!, cancellationToken).ConfigureAwait(false);
        return Ok(snapshot.Categories);
    }

    /// <summary>
    /// Gets one page of standard Jellyfin channel DTOs for a category.
    /// </summary>
    /// <param name="categoryId">Opaque category identifier returned by <see cref="GetCategories"/>.</param>
    /// <param name="userId">Required only when authenticating with an administrator API key.</param>
    /// <param name="startIndex">Zero-based page start.</param>
    /// <param name="limit">Page size from 1 through 250.</param>
    /// <param name="addCurrentProgram">Whether to attach Jellyfin's current-program data.</param>
    /// <param name="cancellationToken">Request cancellation token.</param>
    /// <returns>A standard Jellyfin query result containing existing Live TV channel DTOs.</returns>
    [HttpGet("{categoryId}/Channels")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<QueryResult<BaseItemDto>>> GetCategoryChannels(
        [FromRoute, Required] string categoryId,
        [FromQuery] Guid? userId,
        [FromQuery, Range(0, int.MaxValue)] int startIndex = 0,
        [FromQuery, Range(1, 250)] int limit = 100,
        [FromQuery] bool addCurrentProgram = true,
        CancellationToken cancellationToken = default)
    {
        var resolution = await ResolveUserAsync(userId).ConfigureAwait(false);
        if (resolution.Error is not null)
        {
            return resolution.Error;
        }

        var user = resolution.User!;
        var snapshot = await _categoryIndex.GetForUserAsync(user, cancellationToken).ConfigureAwait(false);
        var page = snapshot.GetPage(categoryId, startIndex, limit);
        if (page is null)
        {
            return NotFound();
        }

        var channelItems = new List<BaseItem>(page.Items.Count);
        foreach (var channelId in page.Items)
        {
            if (_libraryManager.GetItemById(channelId) is LiveTvChannel channel && channel.IsVisible(user))
            {
                channelItems.Add(channel);
            }
        }

        var dtoOptions = new DtoOptions(false)
        {
            EnableImages = true,
            ImageTypeLimit = 1,
            EnableUserData = true,
            AddCurrentProgram = addCurrentProgram
        };
        var dtos = _dtoService.GetBaseItemDtos(
            channelItems,
            dtoOptions,
            user,
            skipVisibilityCheck: true);
        return new QueryResult<BaseItemDto>(page.StartIndex, page.TotalRecordCount, dtos);
    }

    private async Task<UserResolution> ResolveUserAsync(Guid? requestedUserId)
    {
        var authorization = await _authorizationContext.GetAuthorizationInfo(HttpContext).ConfigureAwait(false);
        User? user;

        if (authorization.User is not null)
        {
            if (requestedUserId.HasValue
                && requestedUserId.Value != Guid.Empty
                && requestedUserId.Value != authorization.User.Id)
            {
                return new UserResolution(null, Forbid());
            }

            user = authorization.User;
        }
        else if (authorization.IsApiKey)
        {
            if (!requestedUserId.HasValue || requestedUserId.Value == Guid.Empty)
            {
                return new UserResolution(
                    null,
                    BadRequest(new ProblemDetails
                    {
                        Title = "A userId is required when using an API key.",
                        Status = StatusCodes.Status400BadRequest
                    }));
            }

            user = _userManager.GetUserById(requestedUserId.Value);
            if (user is null)
            {
                return new UserResolution(null, NotFound());
            }
        }
        else
        {
            return new UserResolution(null, Unauthorized());
        }

        return user.HasPermission(PermissionKind.EnableLiveTvAccess)
            ? new UserResolution(user, null)
            : new UserResolution(null, Forbid());
    }

    private sealed record UserResolution(User? User, ActionResult? Error);
}
