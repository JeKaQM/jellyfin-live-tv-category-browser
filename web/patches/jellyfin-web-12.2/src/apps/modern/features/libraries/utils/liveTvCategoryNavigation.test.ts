import { describe, expect, it } from 'vitest';

import { CHANNEL_FOCUS_HISTORY_STATE, findChannelFocusTarget, rememberChannelInHistory } from './liveTvCategoryNavigation';

describe('category navigation compatibility', () => {
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
