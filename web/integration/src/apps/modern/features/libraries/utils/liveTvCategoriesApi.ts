import type { Api } from '@jellyfin/sdk';
import type { AxiosRequestConfig } from 'axios';

import type { ItemDtoQueryResult } from 'types/base/models/item-dto-query-result';
import type { JellyfinApiContext } from './liveTvJellyfinAdapter';
import { normalizeLiveTvCategories } from './liveTvCategories';

const getRequestConfig = (
    api: Api,
    options: AxiosRequestConfig
): AxiosRequestConfig => ({
    ...(api.configuration.baseOptions as AxiosRequestConfig | undefined),
    ...options
});

export const fetchLiveTvCategories = async (
    { api, user }: JellyfinApiContext,
    signal: AbortSignal
) => {
    if (!api || !user?.Id) {
        throw new Error('A Jellyfin API session is required');
    }

    const response = await api.axiosInstance.get<unknown>(
        api.getUri('/LiveTvCategories'),
        getRequestConfig(api, {
            params: { userId: user.Id },
            signal
        })
    );

    return normalizeLiveTvCategories(response.data);
};

export const fetchLiveTvCategoryChannels = async (
    { api, user }: JellyfinApiContext,
    categoryId: string,
    startIndex: number,
    limit: number,
    signal: AbortSignal
) => {
    if (!api || !user?.Id) {
        throw new Error('A Jellyfin API session is required');
    }

    const response = await api.axiosInstance.get<ItemDtoQueryResult>(
        api.getUri(`/LiveTvCategories/${encodeURIComponent(categoryId)}/Channels`),
        getRequestConfig(api, {
            params: {
                userId: user.Id,
                startIndex,
                limit,
                addCurrentProgram: true
            },
            signal
        })
    );

    if (
        !response.data
        || !Array.isArray(response.data.Items)
        || !Number.isInteger(response.data.TotalRecordCount)
        || (response.data.TotalRecordCount ?? -1) < 0
    ) {
        throw new TypeError('Live TV category channel response is invalid');
    }

    return response.data;
};
