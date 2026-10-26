import { describe, expect, it } from 'vitest';

import {
    CATEGORY_FOCUS_HISTORY_STATE, CHANNEL_FOCUS_HISTORY_STATE, findCategoryFocusTarget,
    findChannelFocusTarget, rememberCategoryInHistory, rememberChannelInHistory
} from './liveTvCategoryNavigation';

describe('category navigation compatibility', () => {
    it('remembers the selected category on the list history entry without replacing router bookkeeping', () => {
        const original = { idx: 1, key: 'categories', usr: { otherFeature: 'keep' } };
        const next = rememberCategoryInHistory(original, null, 'news');
        expect(next).toEqual({ ...original, usr: { ...original.usr, [CATEGORY_FOCUS_HISTORY_STATE]: 'news' } });
        expect(original.usr).not.toHaveProperty(CATEGORY_FOCUS_HISTORY_STATE);
        expect(rememberCategoryInHistory(null, { otherFeature: true }, 'sports').usr).toEqual({
            otherFeature: true, [CATEGORY_FOCUS_HISTORY_STATE]: 'sports'
        });
    });

    it('restores the selected category tile rather than the first All channels tile', () => {
        const container = document.createElement('div');
        container.innerHTML = '<button data-category-id="all-channels">All channels</button><button data-category-id="news">News</button>';
        expect(findCategoryFocusTarget(container, 'news')?.textContent).toBe('News');
        expect(findCategoryFocusTarget(container, '"] script')).toBeUndefined();
        expect(findCategoryFocusTarget(null, 'news')).toBeUndefined();
    });

    it('remembers the channel without dropping router or unrelated history state', () => {
        const original = { idx: 3, key: 'channel-list', usr: { categoryEntry: true, otherFeature: 'keep' } };
        const next = rememberChannelInHistory(original, null, 'channel-2');
        expect(next).toEqual({ ...original, usr: { ...original.usr, [CHANNEL_FOCUS_HISTORY_STATE]: 'channel-2' } });
        expect(original.usr).not.toHaveProperty(CHANNEL_FOCUS_HISTORY_STATE);
    });

    it('handles missing history state and uses current location state', () => {
        expect(rememberChannelInHistory(null, { categoryEntry: true }, 'a').usr).toEqual({
            categoryEntry: true, [CHANNEL_FOCUS_HISTORY_STATE]: 'a'
        });
    });

    it('restores a link or nested focus target without interpreting channel IDs as selectors', () => {
        const container = document.createElement('div');
        container.innerHTML = '<div data-id="a"><button>One</button></div><a data-id="b">Two</a>';
        expect(findChannelFocusTarget(container, 'a')?.tagName).toBe('BUTTON');
        expect(findChannelFocusTarget(container, 'b')?.tagName).toBe('A');
        expect(findChannelFocusTarget(container, '"] script')).toBeUndefined();
        expect(findChannelFocusTarget(null, 'a')).toBeUndefined();
    });
});
