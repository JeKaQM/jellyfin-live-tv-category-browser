const MAX_PAGE_SIZE = 250;

export const ALL_CHANNELS_ENTRY = Object.freeze({
    id: 'all-channels',
    name: 'All Channels',
    channelCount: null,
    isAllChannels: true
});

const categoryCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base'
});

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${fieldName} must be a non-empty string`);
    }

    return value;
}

function normalizeCategory(value) {
    if (!value || typeof value !== 'object') {
        throw new TypeError('Category entries must be objects');
    }

    const channelCount = Number(value.channelCount);
    if (!Number.isInteger(channelCount) || channelCount < 0) {
        throw new TypeError('category.channelCount must be a non-negative integer');
    }

    return Object.freeze({
        id: requireString(value.id, 'category.id'),
        name: requireString(value.name, 'category.name'),
        channelCount,
        isAllChannels: false
    });
}

function normalizeCategoryPayload(payload) {
    const rawCategories = Array.isArray(payload) ? payload : payload?.Items;
    if (!Array.isArray(rawCategories)) {
        throw new TypeError('Category API response must be an array or contain Items');
    }

    const ids = new Set();
    return rawCategories
        .map(normalizeCategory)
        .filter((category) => {
            if (ids.has(category.id)) {
                return false;
            }

            ids.add(category.id);
            return true;
        })
        .sort((left, right) => categoryCollator.compare(left.name, right.name));
}

function pageOptions(options = {}) {
    const startIndex = Number.isInteger(options.startIndex) && options.startIndex >= 0
        ? options.startIndex
        : 0;
    const requestedLimit = Number.isInteger(options.limit) ? options.limit : 100;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE);

    return {
        startIndex,
        limit,
        addCurrentProgram: options.addCurrentProgram !== false
    };
}

export class LiveTvCategoryService {
    constructor(request) {
        if (typeof request !== 'function') {
            throw new TypeError('request must be a function');
        }

        this.request = request;
    }

    async getLandingEntries() {
        try {
            const payload = await this.request({
                path: 'LiveTvCategories',
                query: {}
            });
            return Object.freeze({
                entries: Object.freeze([ALL_CHANNELS_ENTRY, ...normalizeCategoryPayload(payload)]),
                error: null
            });
        } catch (error) {
            return Object.freeze({
                entries: Object.freeze([ALL_CHANNELS_ENTRY]),
                error
            });
        }
    }

    async getCategoryChannels(categoryId, options = {}) {
        requireString(categoryId, 'categoryId');
        const payload = await this.request({
            path: `LiveTvCategories/${encodeURIComponent(categoryId)}/Channels`,
            query: pageOptions(options)
        });

        if (!payload || !Array.isArray(payload.Items)) {
            throw new TypeError('Category channel response must contain an Items array');
        }

        const total = Number(payload.TotalRecordCount);
        if (!Number.isInteger(total) || total < 0) {
            throw new TypeError('TotalRecordCount must be a non-negative integer');
        }

        return payload;
    }
}

/**
 * Adapter for Jellyfin Web's existing ApiClient. It reuses the current server,
 * session and authentication headers; no provider credentials enter the page.
 */
export function createJellyfinRequest(apiClient) {
    if (!apiClient || typeof apiClient.getUrl !== 'function' || typeof apiClient.ajax !== 'function') {
        throw new TypeError('A compatible Jellyfin ApiClient is required');
    }

    return ({ path, query }) => apiClient.ajax({
        type: 'GET',
        url: apiClient.getUrl(path, query),
        dataType: 'json'
    });
}
