import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentApiClient = vi.hoisted(() => vi.fn());
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: {} }));
vi.mock('components/images/imageLoader', () => ({ default: {} }));
vi.mock('components/loading/loading', () => ({ default: {} }));
vi.mock('components/maintabsmanager', () => ({}));
vi.mock('scripts/inputManager', () => ({ default: {} }));
vi.mock('scripts/settings/userSettings', () => ({}));

import adapter from 'apps/legacy/controllers/livetv/livetvcategoriesAdapter';

const clientFor = userId => ({
    getCurrentUserId: vi.fn(() => userId),
    getUrl: vi.fn((resource, query) => ({ resource, query })),
    ajax: vi.fn().mockResolvedValue([])
});

beforeEach(() => {
    vi.clearAllMocks();
    delete window.ApiClient;
});

describe('legacy category session adapter', () => {
    it('uses the current authenticated client on each request without a global alias', async () => {
        const first = clientFor('first-user');
        const second = clientFor('second-user');
        currentApiClient.mockReturnValueOnce(first).mockReturnValueOnce(second);
        await adapter.getCategories();
        await adapter.getCategories();
        expect(currentApiClient).toHaveBeenCalledTimes(2);
        expect(first.getUrl).toHaveBeenCalledWith('LiveTvCategories', { userId: 'first-user' });
        expect(second.getUrl).toHaveBeenCalledWith('LiveTvCategories', { userId: 'second-user' });
        expect(first.ajax).toHaveBeenCalledWith({
            type: 'GET', url: { resource: 'LiveTvCategories', query: { userId: 'first-user' } }, dataType: 'json'
        });
        expect(second.ajax).toHaveBeenCalledOnce();
    });

    it('retains opaque category encoding and bounded channel query parameters', async () => {
        const client = clientFor('viewer');
        currentApiClient.mockReturnValue(client);
        await adapter.getCategoryChannels({ id: 'news/world', startIndex: 100, limit: 100 });
        expect(client.getUrl).toHaveBeenCalledWith('LiveTvCategories/news%2Fworld/Channels', {
            userId: 'viewer', startIndex: 100, limit: 100, addCurrentProgram: true
        });
    });

    it('rejects through the existing controller error flow when no client is connected', async () => {
        currentApiClient.mockReturnValue(undefined);
        await expect(adapter.getCategories()).rejects.toThrow('No Jellyfin session is available');
        await expect(adapter.getCategoryChannels({ id: 'news', startIndex: 0, limit: 100 }))
            .rejects.toThrow('No Jellyfin session is available');
    });
});
