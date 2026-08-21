using System;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;

namespace Jellyfin.Plugin.LiveTvCategories.Services;

public interface ILiveTvCategoryIndex
{
    Task<UserCategorySnapshot> GetForUserAsync(User user, CancellationToken cancellationToken);

    void Invalidate();
}
