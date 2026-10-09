const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

export function normalizeCategories(payload) {
    const source = Array.isArray(payload) ? payload : payload?.Items;
    if (!Array.isArray(source)) {
        throw new TypeError('Live TV category response is not an array');
    }

    const ids = new Set();
    return source.filter(category => {
        if (!category || typeof category.id !== 'string' || !category.id
            || typeof category.name !== 'string' || !category.name
            || !Number.isInteger(category.channelCount) || category.channelCount < 0
            || ids.has(category.id)) {
            return false;
        }
        ids.add(category.id);
        return true;
    }).sort((left, right) => left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: 'base'
    }));
}

export function categoryPageSize(configured) {
    return Number.isFinite(configured) && configured >= 1 ?
        Math.min(Math.trunc(configured), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
}
