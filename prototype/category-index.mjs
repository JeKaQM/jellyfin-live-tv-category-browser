import { createHash } from 'node:crypto';

const UNCATEGORISED_KEY = 'uncategorised:';
const CATEGORY_KEY_PREFIX = 'category:';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

const categoryCollator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base'
});

function cleanGroupName(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }

    // The display value is deliberately not trimmed or normalized in V1.
    return value;
}

function makeCategoryKey(name) {
    return name === null ? UNCATEGORISED_KEY : `${CATEGORY_KEY_PREFIX}${name}`;
}

export function stableCategoryId(name) {
    const normalizedName = cleanGroupName(name);
    const digest = createHash('sha256')
        .update(makeCategoryKey(normalizedName), 'utf8')
        .digest('base64url');

    return normalizedName === null
        ? `uncategorised-${digest}`
        : `category-${digest}`;
}

function safeChannel(channel) {
    if (!channel || typeof channel.externalId !== 'string' || channel.externalId.length === 0) {
        throw new TypeError('Every channel requires a non-empty externalId');
    }

    return Object.freeze({
        externalId: channel.externalId,
        name: typeof channel.name === 'string' ? channel.name : '',
        number: channel.number == null ? null : String(channel.number)
    });
}

function parsePageOptions(options = {}) {
    const startIndex = Number.isInteger(options.startIndex) && options.startIndex >= 0
        ? options.startIndex
        : 0;
    const requestedLimit = Number.isInteger(options.limit) ? options.limit : DEFAULT_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);

    return { startIndex, limit };
}

/**
 * Models the server-side index only. Never bundle this module into Jellyfin Web.
 */
export function buildCategoryIndex(channels) {
    if (!channels || typeof channels[Symbol.iterator] !== 'function') {
        throw new TypeError('channels must be iterable');
    }

    const groupsByKey = new Map();

    for (const sourceChannel of channels) {
        const channel = safeChannel(sourceChannel);
        const name = cleanGroupName(sourceChannel.channelGroup);
        const key = makeCategoryKey(name);
        let group = groupsByKey.get(key);

        if (!group) {
            group = {
                id: stableCategoryId(name),
                name: name ?? 'Uncategorised',
                channels: []
            };
            groupsByKey.set(key, group);
        }

        group.channels.push(channel);
    }

    const groupsById = new Map();
    const categories = [...groupsByKey.values()]
        .sort((left, right) => categoryCollator.compare(left.name, right.name))
        .map((group) => {
            groupsById.set(group.id, group);
            return Object.freeze({
                id: group.id,
                name: group.name,
                channelCount: group.channels.length
            });
        });

    return Object.freeze({
        categories: Object.freeze(categories),
        totalChannelCount: categories.reduce((total, category) => total + category.channelCount, 0),
        getPage(categoryId, options = {}) {
            const group = groupsById.get(categoryId);
            if (!group) {
                return null;
            }

            const { startIndex, limit } = parsePageOptions(options);
            return Object.freeze({
                Items: Object.freeze(group.channels.slice(startIndex, startIndex + limit)),
                StartIndex: startIndex,
                TotalRecordCount: group.channels.length
            });
        }
    });
}
