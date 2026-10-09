import type { Api } from '@jellyfin/sdk';
import { describe, expect, it, vi } from 'vitest';

import { fetchLiveTvCategories, fetchLiveTvCategoryChannels } from './liveTvCategoriesApi';

function session(data: unknown) {
    const get = vi.fn().mockResolvedValue({ data });
    const api = {
        configuration: { baseOptions: { headers: { Authorization: 'MediaBrowser Token="test-token"' }, timeout: 1234 } },
        getUri: (resource: string) => `https://example.test/jellyfin${resource}`,
        axiosInstance: { get }
    } as unknown as Api;
    return { context: { api, user: { Id: 'user-1' }, __legacyApiClient__: undefined }, get };
}

describe('authenticated category API compatibility', () => {
    it('retains session headers, base path, user scope and cancellation', async () => {
        const { context, get } = session([{ id: 'news', name: 'News', channelCount: 2 }]);
        const signal = { aborted: false } as AbortSignal;
        const result = await fetchLiveTvCategories(context, signal);
        expect(result).toHaveLength(1);
        expect(get).toHaveBeenCalledWith('https://example.test/jellyfin/LiveTvCategories', {
            headers: { Authorization: 'MediaBrowser Token="test-token"' }, timeout: 1234,
            params: { userId: 'user-1' }, signal
        });
    });

    it('encodes category IDs and preserves paging and current-program requests', async () => {
        const { context, get } = session({ Items: [{ Id: 'channel-1' }], TotalRecordCount: 2 });
        const signal = { aborted: false } as AbortSignal;
        await fetchLiveTvCategoryChannels(context, 'Café / News', 100, 50, signal);
        expect(get).toHaveBeenCalledWith(expect.stringContaining('/Caf%C3%A9%20%2F%20News/Channels'), expect.objectContaining({
            params: { userId: 'user-1', startIndex: 100, limit: 50, addCurrentProgram: true }, signal
        }));
    });

    it('rejects missing sessions and malformed channel results', async () => {
        const { context } = session({ Items: [], TotalRecordCount: -1 });
        const signal = { aborted: false } as AbortSignal;
        await expect(fetchLiveTvCategoryChannels(context, 'news', 0, 100, signal)).rejects.toThrow(TypeError);
        await expect(fetchLiveTvCategories({ ...context, user: undefined }, signal)).rejects.toThrow('session');
    });
});
