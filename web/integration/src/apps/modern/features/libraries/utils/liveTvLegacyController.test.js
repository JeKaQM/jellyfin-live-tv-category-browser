import { beforeEach, describe, expect, it, vi } from 'vitest';

const adapter = vi.hoisted(() => ({
    loading: { show: vi.fn(), hide: vi.fn() },
    pageSize: vi.fn(() => 100),
    getCategories: vi.fn(),
    getCategoryChannels: vi.fn(),
    channelCards: vi.fn(() => '<button data-id="channel-a">Channel A</button>'),
    loadImages: vi.fn(), showAllChannels: vi.fn(), focusContainer: vi.fn(),
    onInput: vi.fn(), offInput: vi.fn()
}));
vi.mock('apps/legacy/controllers/livetv/livetvcategoriesAdapter', () => ({ default: adapter }));
vi.mock('apps/legacy/controllers/livetv/livetvcategories.template.html', async () => {
    const { readFile } = await import('node:fs/promises');
    return { default: await readFile('src/apps/legacy/controllers/livetv/livetvcategories.template.html', 'utf8') };
});

import Controller from 'apps/legacy/controllers/livetv/livetvcategories';

let view;
let controller;
const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
};
const categoryButton = () => view.querySelector('[data-category-id="news"]');

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
    adapter.getCategories.mockResolvedValue([{ id: 'news', name: 'News', channelCount: 2 }]);
    adapter.getCategoryChannels.mockResolvedValue({ Items: [{ Id: 'channel-a' }], TotalRecordCount: 2 });
    document.body.innerHTML = '<div id="view"><div id="tab"></div></div><button id="outside">Other view</button>';
    view = document.querySelector('#view');
    controller = new Controller(view, {}, document.querySelector('#tab'));
    controller.initTab();
});

describe('legacy category controller behavior', () => {
    it('renders owned SVG controls and treats category names as text', async () => {
        adapter.getCategories.mockResolvedValue([{ id: 'news', name: '<img src=x onerror=alert(1)>', channelCount: 2 }]);
        await controller.renderTab();
        expect(view.querySelector('img')).toBeNull();
        expect(view.querySelector('.liveTvCategoryCardName').textContent).toBe('All Channels');
        expect(categoryButton().textContent).toContain('<img');
        expect(view.querySelectorAll('svg').length).toBe(5);
        expect(view.querySelector('.material-icons')).toBeNull();
    });

    it('keeps the category, channel page and focus across channel-detail navigation', async () => {
        await controller.renderTab();
        categoryButton().click();
        await settle();
        const channel = view.querySelector('[data-id="channel-a"]');
        channel.focus();
        controller.onHide();
        document.querySelector('#outside').focus();
        controller.onShow();
        expect(view.querySelector('.liveTvCategoryChannels').classList.contains('hide')).toBe(false);
        expect(document.activeElement).toBe(channel);
        expect(adapter.getCategoryChannels).toHaveBeenCalledTimes(1);
        expect(adapter.getCategoryChannels).toHaveBeenCalledWith(expect.objectContaining({ startIndex: 0, limit: 100 }));
    });

    it('handles Back inside a category and restores the category button', async () => {
        await controller.renderTab();
        categoryButton().click();
        await settle();
        const preventDefault = vi.fn();
        adapter.onInput.mock.calls[0][0]({ detail: { command: 'back' }, preventDefault });
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(view.querySelector('.liveTvCategoryLanding').classList.contains('hide')).toBe(false);
        expect(document.activeElement).toBe(categoryButton());
    });

    it('ignores a stale request after Back without replacing the landing page', async () => {
        let resolveChannels;
        adapter.getCategoryChannels.mockReturnValue(new Promise(resolve => {
            resolveChannels = resolve;
        }));
        await controller.renderTab();
        categoryButton().click();
        view.querySelector('.btnCategoryBack').click();
        resolveChannels({ Items: [{ Id: 'stale' }], TotalRecordCount: 1 });
        await settle();
        expect(adapter.channelCards).not.toHaveBeenCalled();
        expect(view.querySelector('.liveTvCategoryChannels').classList.contains('hide')).toBe(true);
    });

    it('uses native All Channels when categories are unavailable', async () => {
        adapter.getCategories.mockRejectedValue(new Error('Unavailable'));
        await controller.renderTab();
        expect(view.querySelector('[role="status"]').textContent).toContain('unavailable');
        view.querySelector('[data-category-id="all-channels"]').click();
        expect(adapter.showAllChannels).toHaveBeenCalledOnce();
    });

    it('renders and advances owned SVG paging controls', async () => {
        adapter.getCategoryChannels.mockResolvedValue({ Items: [{ Id: 'channel-a' }], TotalRecordCount: 250 });
        await controller.renderTab();
        categoryButton().click();
        await settle();
        const next = view.querySelector('.btnNextPage');
        expect(next.querySelector('svg')).not.toBeNull();
        expect(view.querySelector('.btnPreviousPage').disabled).toBe(true);
        next.click();
        await settle();
        expect(adapter.getCategoryChannels).toHaveBeenLastCalledWith(expect.objectContaining({ startIndex: 100 }));
    });

    it('does not steal focus when channel data finishes after hiding the tab', async () => {
        let resolveChannels;
        adapter.getCategoryChannels.mockReturnValue(new Promise(resolve => {
            resolveChannels = resolve;
        }));
        await controller.renderTab();
        categoryButton().click();
        controller.onHide();
        adapter.focusContainer.mockClear();
        resolveChannels({ Items: [{ Id: 'channel-a' }], TotalRecordCount: 2 });
        await settle();
        expect(adapter.focusContainer).not.toHaveBeenCalled();
        controller.onShow();
        expect(adapter.focusContainer).toHaveBeenCalledOnce();
    });

    it('does not render a delayed category list after destruction', async () => {
        let resolveCategories;
        adapter.getCategories.mockReturnValue(new Promise(resolve => {
            resolveCategories = resolve;
        }));
        const request = controller.renderTab();
        controller.destroy();
        resolveCategories([{ id: 'late', name: 'Late', channelCount: 1 }]);
        await request;
        expect(view.querySelector('[data-category-id]')).toBeNull();
        expect(adapter.offInput).toHaveBeenCalled();
    });
});
