using System;
using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.LiveTvCategories.Services;

public interface ILiveTvCategoryIndex
{
    Task<UserCategorySnapshot> GetForUserAsync(Guid userId, CancellationToken cancellationToken);

    void Invalidate();
}
