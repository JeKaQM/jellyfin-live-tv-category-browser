// Only this adapter knows Jellyfin's legacy client modules and session API.
import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import loading from 'components/loading/loading';
import * as mainTabsManager from 'components/maintabsmanager';
import inputManager from 'scripts/inputManager';
import * as userSettings from 'scripts/settings/userSettings';
import Dashboard from 'utils/dashboard';

const request = (resource, params = {}) => ApiClient.ajax({
    type: 'GET',
    url: ApiClient.getUrl(resource, { userId: Dashboard.getCurrentUserId(), ...params }),
    dataType: 'json'
});

export default {
    loading,
    pageSize: () => userSettings.libraryPageSize(),
    getCategories: () => request('LiveTvCategories'),
    getCategoryChannels: category => request(
        `LiveTvCategories/${encodeURIComponent(category.id)}/Channels`,
        { startIndex: category.startIndex, limit: category.limit, addCurrentProgram: true }
    ),
    channelCards: channels => cardBuilder.getCardsHtml({
        items: channels,
        shape: 'square',
        showTitle: true,
        lazy: true,
        cardLayout: true,
        showDetailsMenu: true,
        showCurrentProgram: true,
        showCurrentProgramTime: true
    }),
    loadImages: element => imageLoader.lazyChildren(element),
    showAllChannels: () => mainTabsManager.selectedTabIndex(2),
    focusContainer: container => import('components/autoFocuser').then(({ default: autoFocuser }) => {
        autoFocuser.autoFocus(container);
    }),
    onInput: listener => inputManager.on(window, listener),
    offInput: listener => inputManager.off(window, listener)
};
