export const CATEGORY_ID_PARAM = 'categoryId';
export const CATEGORY_START_INDEX_PARAM = 'categoryStartIndex';
export const CATEGORY_HISTORY_STATE = 'liveTvCategoryEntry';
export const CATEGORY_FOCUS_HISTORY_STATE = 'liveTvCategoryFocusedCategoryId';
export const CHANNEL_FOCUS_HISTORY_STATE = 'liveTvCategoryFocusedChannelId';

export type NavigationState = Record<string, unknown>;

export const getNavigationState = (state: unknown): NavigationState => (
    typeof state === 'object' && state !== null ? state as NavigationState : {}
);

// Keep React Router's bookkeeping and any unrelated location state intact.
export const rememberChannelInHistory = (historyState: unknown, locationState: unknown, channelId: string) => {
    const router = getNavigationState(historyState);
    return {
        ...router,
        usr: {
            ...getNavigationState(router.usr ?? locationState),
            [CHANNEL_FOCUS_HISTORY_STATE]: channelId
        }
    };
};

export const rememberCategoryInHistory = (historyState: unknown, locationState: unknown, categoryId: string) => {
    const router = getNavigationState(historyState);
    return {
        ...router,
        usr: {
            ...getNavigationState(router.usr ?? locationState),
            [CATEGORY_FOCUS_HISTORY_STATE]: categoryId
        }
    };
};

export const findCategoryFocusTarget = (container: HTMLElement | null, categoryId: string) => (
    Array.from(container?.querySelectorAll<HTMLElement>('[data-category-id]') ?? [])
        .find(element => element.dataset.categoryId === categoryId)
);

export const findChannelFocusTarget = (container: HTMLElement | null, channelId: string) => {
    const card = Array.from(container?.querySelectorAll<HTMLElement>('[data-id]') ?? [])
        .find(element => element.dataset.id === channelId);
    return card?.matches('button, a, input, select, textarea, .focusable') ?
        card : card?.querySelector<HTMLElement>(
            'button:not(:disabled):not([tabindex="-1"]), a:not([tabindex="-1"]), .focusable'
        );
};
