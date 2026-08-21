import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALL_CHANNELS_ENTRY,
    LiveTvCategoryService,
    createJellyfinRequest
} from '../src/category-service.mjs';

test('the landing request fetches only the category summary endpoint', async () => {
    const calls = [];
    const service = new LiveTvCategoryService(async (request) => {
        calls.push(request);
        return [
            { id: 'sport', name: 'UK Sport', channelCount: 74 },
            { id: 'general', name: 'UK General', channelCount: 122 }
        ];
    });

    const state = await service.getLandingEntries();

    assert.deepEqual(calls, [{ path: 'LiveTvCategories', query: {} }]);
    assert.equal(state.entries[0], ALL_CHANNELS_ENTRY);
    assert.deepEqual(state.entries.slice(1).map(({ name }) => name), ['UK General', 'UK Sport']);
    assert.equal(state.error, null);
});

test('supports more than 50 categories without channel requests', async () => {
    let requestCount = 0;
    const categories = Array.from({ length: 75 }, (_, i) => ({
        id: `category-${i}`,
        name: `Category ${i}`,
        channelCount: i + 1
    }));
    const service = new LiveTvCategoryService(async () => {
        requestCount += 1;
        return categories;
    });

    const state = await service.getLandingEntries();
    assert.equal(requestCount, 1);
    assert.equal(state.entries.length, 76);
});

test('category selection uses an encoded opaque ID and bounded pagination', async () => {
    let observed;
    const service = new LiveTvCategoryService(async (request) => {
        observed = request;
        return { Items: [{ Id: 'jellyfin-channel-id' }], StartIndex: 12, TotalRecordCount: 1 };
    });

    const page = await service.getCategoryChannels('opaque/Україна & sport', {
        startIndex: 12,
        limit: 10_000
    });

    assert.equal(observed.path, 'LiveTvCategories/opaque%2F%D0%A3%D0%BA%D1%80%D0%B0%D1%97%D0%BD%D0%B0%20%26%20sport/Channels');
    assert.deepEqual(observed.query, {
        startIndex: 12,
        limit: 250,
        addCurrentProgram: true
    });
    assert.equal(page.Items[0].Id, 'jellyfin-channel-id');
});

test('a category failure degrades to All Channels', async () => {
    const expectedError = new Error('server unavailable');
    const service = new LiveTvCategoryService(async () => {
        throw expectedError;
    });

    const state = await service.getLandingEntries();
    assert.deepEqual(state.entries, [ALL_CHANNELS_ENTRY]);
    assert.equal(state.error, expectedError);
});

test('the Jellyfin adapter reuses ApiClient URL and authenticated ajax behavior', async () => {
    const calls = [];
    const apiClient = {
        getUrl(path, query) {
            calls.push({ kind: 'url', path, query });
            return `https://jellyfin.invalid/${path}`;
        },
        async ajax(options) {
            calls.push({ kind: 'ajax', options });
            return [];
        }
    };

    const request = createJellyfinRequest(apiClient);
    await request({ path: 'LiveTvCategories', query: {} });

    assert.deepEqual(calls, [
        { kind: 'url', path: 'LiveTvCategories', query: {} },
        {
            kind: 'ajax',
            options: {
                type: 'GET',
                url: 'https://jellyfin.invalid/LiveTvCategories',
                dataType: 'json'
            }
        }
    ]);
});
