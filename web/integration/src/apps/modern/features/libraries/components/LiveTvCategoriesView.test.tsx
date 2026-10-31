import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import React, { act, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CardOptions } from '../utils/liveTvJellyfinAdapter';
import LiveTvCategoriesView from './LiveTvCategoriesView';

const mocks = vi.hoisted(() => ({
    useApi: vi.fn(),
    cards: vi.fn<(props: { cardOptions: CardOptions }) => null>(() => null),
    queryKey: [ 'LiveTvCategories', 'news', 'Channels' ]
}));

vi.mock('../utils/liveTvJellyfinAdapter', () => ({
    useApi: mocks.useApi,
    useUserSettings: () => ({ libraryPageSize: 100 }),
    useLocation: () => ({ state: null }),
    useNavigate: () => vi.fn(),
    useSearchParams: () => [ new URLSearchParams('categoryId=news'), vi.fn() ],
    Cards: mocks.cards,
    CardShape: { Square: 'square' },
    ItemsContainer: ({ children }: PropsWithChildren) => children,
    autoFocuser: { autoFocus: vi.fn() },
    globalize: { translate: (key: string) => key }
}));

vi.mock('../hooks/api/useLiveTvCategories', () => ({
    getLiveTvCategoryChannelsQueryKey: () => mocks.queryKey,
    useLiveTvCategories: () => ({ data: [{ id: 'news', name: 'News', channelCount: 1 }] }),
    useLiveTvCategoryChannels: () => ({
        data: { Items: [{ Id: 'channel-1' }], TotalRecordCount: 1 },
        isSuccess: true,
        refetch: vi.fn()
    })
}));

describe('category channel card server identity', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    const renderCardOptions = async (serverId?: string): Promise<CardOptions> => {
        // UserDto.ServerId exists in both stable and post-legacy-client contexts.
        mocks.useApi.mockReturnValue({ user: { Id: 'user-1', ServerId: serverId } });
        mocks.cards.mockClear();
        await act(async () => root.render(<LiveTvCategoriesView />));
        expect(mocks.cards).toHaveBeenCalled();
        return mocks.cards.mock.calls[0][0].cardOptions;
    };

    it('uses the authenticated user server without a legacy API client', async () => {
        expect(await renderCardOptions('server-1')).toMatchObject({
            serverId: 'server-1',
            context: CollectionType.Livetv,
            showCurrentProgram: true,
            showDetailsMenu: true
        });
        // Keep the query key unchanged to exercise the memo's server dependency.
        expect((await renderCardOptions('server-2')).serverId).toBe('server-2');
    });

    it('clears server identity when the user no longer has a server ID', async () => {
        expect((await renderCardOptions('server-1')).serverId).toBe('server-1');
        expect((await renderCardOptions()).serverId).toBeUndefined();
    });
});
