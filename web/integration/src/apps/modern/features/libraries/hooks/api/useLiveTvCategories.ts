import { useQuery } from '@tanstack/react-query';

import { useApi } from '../../utils/liveTvJellyfinAdapter';
import { fetchLiveTvCategories, fetchLiveTvCategoryChannels } from '../../utils/liveTvCategoriesApi';

const CATEGORIES_STALE_TIME = 5 * 60 * 1000;
const CHANNELS_STALE_TIME = 30 * 1000;

export const getLiveTvCategoriesQueryKey = (
    basePath: string | undefined,
    userId: string | null | undefined
) => [ 'LiveTvCategories', basePath, userId ] as const;

export const getLiveTvCategoryChannelsQueryKey = (
    basePath: string | undefined,
    userId: string | null | undefined,
    categoryId: string | null,
    startIndex: number,
    limit: number
) => [
    ...getLiveTvCategoriesQueryKey(basePath, userId),
    categoryId,
    'Channels',
    { startIndex, limit }
] as const;

export const useLiveTvCategories = () => {
    const currentApi = useApi();

    return useQuery({
        queryKey: getLiveTvCategoriesQueryKey(
            currentApi.api?.basePath,
            currentApi.user?.Id
        ),
        queryFn: ({ signal }) => fetchLiveTvCategories(currentApi, signal),
        enabled: !!currentApi.api && !!currentApi.user?.Id,
        staleTime: CATEGORIES_STALE_TIME
    });
};

export const useLiveTvCategoryChannels = (
    categoryId: string | null,
    startIndex: number,
    limit: number
) => {
    const currentApi = useApi();

    return useQuery({
        queryKey: getLiveTvCategoryChannelsQueryKey(
            currentApi.api?.basePath,
            currentApi.user?.Id,
            categoryId,
            startIndex,
            limit
        ),
        queryFn: ({ signal }) => fetchLiveTvCategoryChannels(
            currentApi,
            categoryId!,
            startIndex,
            limit,
            signal
        ),
        enabled: !!currentApi.api && !!currentApi.user?.Id && !!categoryId,
        staleTime: CHANNELS_STALE_TIME
    });
};
