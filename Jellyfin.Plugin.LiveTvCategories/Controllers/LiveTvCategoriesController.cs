using System.ComponentModel.DataAnnotations;
using System.Net.Mime;
using Jellyfin.Plugin.LiveTvCategories.Models;
using Jellyfin.Plugin.LiveTvCategories.Services;
using MediaBrowser.Common.Api;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.LiveTvCategories.Controllers;

/// <summary>
/// A stable, summary-first API over the isolated Jellyfin compatibility adapter.
/// </summary>
[ApiController]
[Authorize(Policy = Policies.LiveTvAccess)]
[Route("LiveTvCategories")]
[Produces(MediaTypeNames.Application.Json)]
public sealed class LiveTvCategoriesController : ControllerBase
{
    private readonly ILiveTvCategoryIndex _categoryIndex;
    private readonly ILiveTvCompatibilityAdapter _adapter;

    public LiveTvCategoriesController(ILiveTvCategoryIndex categoryIndex, ILiveTvCompatibilityAdapter adapter)
    {
        _categoryIndex = categoryIndex;
        _adapter = adapter;
    }

    /// <summary>Gets dynamic category summaries for the current Live TV user.</summary>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public Task<ActionResult<IReadOnlyList<LiveTvCategorySummary>>> GetCategories(
        [FromQuery] Guid? userId,
        CancellationToken cancellationToken) => ExecuteForUserAsync<IReadOnlyList<LiveTvCategorySummary>>(
            userId,
            async resolvedUserId =>
            {
                var snapshot = await _categoryIndex.GetForUserAsync(resolvedUserId, cancellationToken).ConfigureAwait(false);
                return Ok(snapshot.Categories);
            });

    /// <summary>Gets one page of standard Jellyfin channel DTOs for a category.</summary>
    [HttpGet("{categoryId}/Channels")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public Task<ActionResult<QueryResult<BaseItemDto>>> GetCategoryChannels(
        [FromRoute, Required] string categoryId,
        [FromQuery] Guid? userId,
        [FromQuery, Range(0, int.MaxValue)] int startIndex = 0,
        [FromQuery, Range(1, 250)] int limit = 100,
        [FromQuery] bool addCurrentProgram = true,
        CancellationToken cancellationToken = default) => ExecuteForUserAsync<QueryResult<BaseItemDto>>(
            userId,
            async resolvedUserId =>
            {
                if (startIndex < 0 || limit is < 1 or > 250)
                {
                    return BadRequest();
                }

                var snapshot = await _categoryIndex.GetForUserAsync(resolvedUserId, cancellationToken).ConfigureAwait(false);
                var page = snapshot.GetPage(categoryId, startIndex, limit);
                if (page is null)
                {
                    return NotFound();
                }

                var dtos = _adapter.GetChannelDtos(resolvedUserId, page.Items, addCurrentProgram, cancellationToken);
                return new QueryResult<BaseItemDto>(page.StartIndex, page.TotalRecordCount, dtos);
            });

    private async Task<ActionResult<T>> ExecuteForUserAsync<T>(Guid? requestedUserId, Func<Guid, Task<ActionResult<T>>> action)
    {
        try
        {
            var resolution = await _adapter.ResolveUserAsync(HttpContext, requestedUserId).ConfigureAwait(false);
            var error = resolution.Error switch
            {
                CategoryUserResolutionError.None => null,
                CategoryUserResolutionError.Unauthenticated => (ActionResult)Unauthorized(),
                CategoryUserResolutionError.UserRequired => BadRequest(new ProblemDetails
                {
                    Title = "A userId is required when using an API key.",
                    Status = StatusCodes.Status400BadRequest
                }),
                CategoryUserResolutionError.UserNotFound => NotFound(),
                _ => Forbid()
            };
            if (error is not null)
            {
                return error;
            }

            if (!resolution.UserId.HasValue || resolution.UserId == Guid.Empty)
            {
                return Unauthorized();
            }

            return await action(resolution.UserId.Value).ConfigureAwait(false);
        }
        catch (CategoryAccessDeniedException)
        {
            return Forbid();
        }
        catch (CategorySourceUnavailableException)
        {
            _categoryIndex.Invalidate();
            Response.Headers.RetryAfter = "30";
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Title = "Live TV categories are temporarily unavailable.",
                Detail = "Normal Jellyfin Live TV browsing remains available. Please try again shortly.",
                Status = StatusCodes.Status503ServiceUnavailable
            });
        }
    }
}
