import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import libraryBrowser from 'scripts/libraryBrowser';
import loading from 'components/loading/loading';
import * as mainTabsManager from 'components/maintabsmanager';
import globalize from 'lib/globalize';
import inputManager from 'scripts/inputManager';
import * as userSettings from 'scripts/settings/userSettings';
import { LibraryTab } from 'types/libraryTab';
import Dashboard from 'utils/dashboard';

import './livetvcategories.scss';

import 'elements/emby-itemscontainer/emby-itemscontainer';
import 'elements/emby-tabs/emby-tabs';
import 'elements/emby-button/emby-button';

const DEFAULT_CATEGORY_PAGE_SIZE = 100;
const MAX_CATEGORY_PAGE_SIZE = 250;
const ALL_CHANNELS_ID = 'all-channels';

function getTabs() {
    return [{
        name: globalize.translate('Programs')
    }, {
        name: globalize.translate('Guide')
    }, {
        name: globalize.translate('Channels')
    }, {
        name: globalize.translate('Recordings')
    }, {
        name: globalize.translate('Schedule')
    }, {
        name: globalize.translate('Series')
    }];
}

function getDefaultTabIndex(folderId) {
    switch (userSettings.get('landing-' + folderId)) {
        case LibraryTab.Guide:
            return 1;
        case LibraryTab.Channels:
            return 2;
        case LibraryTab.Recordings:
            return 3;
        case LibraryTab.Schedule:
            return 4;
        case LibraryTab.SeriesTimers:
            return 5;
        default:
            return 0;
    }
}

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function createStatus(documentRef, text) {
    const status = documentRef.createElement('div');
    status.className = 'liveTvCategoryStatus';
    status.setAttribute('role', 'status');
    status.textContent = text;
    return status;
}

function categoryIcon(category) {
    if (category.id === ALL_CHANNELS_ID) {
        return 'apps';
    }

    const name = category.name.toUpperCase();
    if (/SPORT|F1|MOTOGP|FIFA|NFL|NHL|NBA|MLB|MLS|CRICKET|OLYMPIC/.test(name)) {
        return 'sports_soccer';
    }

    if (/KIDS|CHILD|FAMILY|FAMIL|ENFANT|COCUK|FEMIJET/.test(name)) {
        return 'child_care';
    }

    if (/CINEMA|MOVIE|FILM|SINEMA/.test(name)) {
        return 'movie';
    }

    if (/MUSIC|MUZIK|MUZIKE|RADIO|RADIOFONO/.test(name)) {
        return 'music_note';
    }

    if (/NEWS|INFORMATION|HABER|LAJME/.test(name)) {
        return 'article';
    }

    return 'live_tv';
}

function createCategoryRow(documentRef, category) {
    const row = documentRef.createElement('div');
    row.className = 'liveTvCategoryCard';

    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'button-flat liveTvCategoryButton';
    button.dataset.categoryId = category.id;
    button.setAttribute(
        'aria-label',
        category.channelCount === null
            ? category.name
            : `${category.name}, ${category.channelCount.toLocaleString()} channels`);

    const icon = documentRef.createElement('span');
    icon.className = 'material-icons liveTvCategoryIcon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = categoryIcon(category);

    const copy = documentRef.createElement('span');
    copy.className = 'liveTvCategoryCopy';

    const heading = documentRef.createElement('span');
    heading.className = 'liveTvCategoryCardName';
    heading.textContent = category.name;

    const count = documentRef.createElement('span');
    count.className = 'liveTvCategoryCardCount';
    count.textContent = category.channelCount === null
        ? 'Browse the complete channel list'
        : `${category.channelCount.toLocaleString()} channels`;

    const chevron = documentRef.createElement('span');
    chevron.className = 'material-icons liveTvCategoryChevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = 'chevron_right';

    copy.appendChild(heading);
    copy.appendChild(count);
    button.appendChild(icon);
    button.appendChild(copy);
    button.appendChild(chevron);
    row.appendChild(button);
    return row;
}

function normalizeCategories(payload) {
    const source = Array.isArray(payload) ? payload : payload?.Items;
    if (!Array.isArray(source)) {
        throw new TypeError('Live TV category response is not an array');
    }

    const ids = new Set();
    return source.filter(category => {
        if (!category || typeof category.id !== 'string' || typeof category.name !== 'string'
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

function categoryPageSize() {
    const configured = userSettings.libraryPageSize();
    return configured > 0
        ? Math.min(configured, MAX_CATEGORY_PAGE_SIZE)
        : DEFAULT_CATEGORY_PAGE_SIZE;
}

function getCategoryChannelsHtml(channels) {
    return cardBuilder.getCardsHtml({
        items: channels,
        shape: 'square',
        showTitle: true,
        lazy: true,
        cardLayout: true,
        showDetailsMenu: true,
        showCurrentProgram: true,
        showCurrentProgramTime: true
    });
}

export default function (view, params) {
    function onBeforeTabChange(evt) {
        preLoadTab(view, parseInt(evt.detail.selectedTabIndex, 10));
    }

    function onTabChange(evt) {
        const previousTabController = tabControllers[parseInt(evt.detail.previousIndex, 10)];

        if (previousTabController?.onHide) {
            previousTabController.onHide();
        }

        loadTab(view, parseInt(evt.detail.selectedTabIndex, 10));
    }

    function getTabContainers() {
        return view.querySelectorAll('.pageTabContent');
    }

    function initTabs() {
        mainTabsManager.setTabs(view, currentTabIndex, getTabs, getTabContainers, onBeforeTabChange, onTabChange);
    }

    function getTabController(page, index, callback) {
        let depends;

        switch (index) {
            case 0:
                depends = 'livetvsuggested';
                break;
            case 1:
                depends = 'livetvguide';
                break;
            case 2:
                depends = 'livetvchannels';
                break;
            case 3:
                depends = 'livetvrecordings';
                break;
            case 4:
                depends = 'livetvschedule';
                break;
            case 5:
                depends = 'livetvseriestimers';
                break;
        }

        import(`../livetv/${depends}`).then(({ default: ControllerFactory }) => {
            let tabContent;

            if (index === 0) {
                tabContent = view.querySelector(`.pageTabContent[data-index="${index}"]`);
                self.tabContent = tabContent;
            }

            let controller = tabControllers[index];

            if (!controller) {
                tabContent = view.querySelector(`.pageTabContent[data-index="${index}"]`);
                controller = index === 0 ? self : new ControllerFactory(view, params, tabContent);
                tabControllers[index] = controller;

                if (controller.initTab) {
                    controller.initTab();
                }
            }

            callback(controller);
        });
    }

    function preLoadTab(page, index) {
        getTabController(page, index, function (controller) {
            if (renderedTabs.indexOf(index) === -1 && controller.preRender) {
                controller.preRender();
            }
        });
    }

    function loadTab(page, index) {
        currentTabIndex = index;
        getTabController(page, index, function (controller) {
            initialTabIndex = null;

            if (renderedTabs.indexOf(index) === -1) {
                if (index === 1) {
                    renderedTabs.push(index);
                }

                controller.renderTab();
            } else if (controller.onShow) {
                controller.onShow();
            }

            currentTabController = controller;
        });
    }

    function categoryListContainer() {
        return view.querySelector('.liveTvCategoryList');
    }

    function categoryLandingContainer() {
        return view.querySelector('.liveTvCategoryLanding');
    }

    function categoryChannelContainer() {
        return view.querySelector('.liveTvCategoryChannels');
    }

    function showCategoryList() {
        selectedCategory = null;
        categoryChannelContainer().classList.add('hide');
        categoryLandingContainer().classList.remove('hide');
    }

    function returnToCategoryList() {
        showCategoryList();
        focusContainer(categoryListContainer());
    }

    function renderCategoryList(categories, error) {
        const container = categoryListContainer();
        const documentRef = container.ownerDocument;
        const fragment = documentRef.createDocumentFragment();
        const allChannels = {
            id: ALL_CHANNELS_ID,
            name: 'All Channels',
            channelCount: null
        };

        clearElement(container);
        categoryMap = new Map(categories.map(category => [category.id, category]));
        const totalChannels = categories.reduce((total, category) => total + category.channelCount, 0);
        const summary = categoryLandingContainer().querySelector('.liveTvCategorySummary');
        summary.textContent = error
            ? 'Category service unavailable'
            : `${categories.length.toLocaleString()} categories \u00b7 ${totalChannels.toLocaleString()} channels`;

        if (error) {
            fragment.appendChild(createStatus(
                documentRef,
                'Live TV categories could not be loaded. All Channels is still available.'));
        } else if (categories.length === 0) {
            fragment.appendChild(createStatus(documentRef, 'No Live TV categories are available.'));
        }

        fragment.appendChild(createCategoryRow(documentRef, allChannels));
        for (const category of categories) {
            fragment.appendChild(createCategoryRow(documentRef, category));
        }

        container.appendChild(fragment);
        showCategoryList();
    }

    function focusContainer(container) {
        import('../../components/autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(container);
        });
    }

    function loadCategories() {
        loading.show();
        return ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('LiveTvCategories', {
                userId: Dashboard.getCurrentUserId()
            }),
            dataType: 'json'
        }).then(payload => {
            try {
                renderCategoryList(normalizeCategories(payload), null);
                focusContainer(categoryListContainer());
            } catch (error) {
                renderCategoryList([], error);
                focusContainer(categoryListContainer());
            }

            loading.hide();
        }, () => {
            renderCategoryList([], true);
            loading.hide();
            focusContainer(categoryListContainer());
        });
    }

    function renderCategoryPaging(result) {
        const context = categoryChannelContainer();
        for (const element of context.querySelectorAll('.paging')) {
            element.innerHTML = libraryBrowser.getQueryPagingHtml({
                startIndex: selectedCategory.startIndex,
                limit: selectedCategory.limit,
                totalRecordCount: result.TotalRecordCount,
                showLimit: false,
                updatePageSizeSetting: false,
                filterButton: false
            });
        }

        for (const button of context.querySelectorAll('.btnNextPage')) {
            button.addEventListener('click', onNextCategoryPage);
        }

        for (const button of context.querySelectorAll('.btnPreviousPage')) {
            button.addEventListener('click', onPreviousCategoryPage);
        }
    }

    function renderCategoryChannels(result) {
        const context = categoryChannelContainer();
        const items = context.querySelector('.liveTvCategoryChannelItems');
        const error = context.querySelector('.liveTvCategoryChannelError');
        error.classList.add('hide');
        error.textContent = '';
        items.innerHTML = getCategoryChannelsHtml(result.Items);
        imageLoader.lazyChildren(items);
        renderCategoryPaging(result);
        focusContainer(context);
    }

    function renderCategoryChannelError() {
        const context = categoryChannelContainer();
        const error = context.querySelector('.liveTvCategoryChannelError');
        error.textContent = 'This category could not be loaded. Return to the category list or try again.';
        error.classList.remove('hide');
        context.querySelector('.liveTvCategoryChannelItems').textContent = '';
        for (const paging of context.querySelectorAll('.paging')) {
            paging.textContent = '';
        }
    }

    function loadCategoryChannels() {
        if (!selectedCategory || categoryRequestPending) {
            return Promise.resolve();
        }

        categoryRequestPending = true;
        loading.show();
        return ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl(
                `LiveTvCategories/${encodeURIComponent(selectedCategory.id)}/Channels`,
                {
                    userId: Dashboard.getCurrentUserId(),
                    startIndex: selectedCategory.startIndex,
                    limit: selectedCategory.limit,
                    addCurrentProgram: true
                }),
            dataType: 'json'
        }).then(result => {
            if (!result || !Array.isArray(result.Items)) {
                renderCategoryChannelError();
            } else {
                renderCategoryChannels(result);
            }

            categoryRequestPending = false;
            loading.hide();
        }, () => {
            renderCategoryChannelError();
            categoryRequestPending = false;
            loading.hide();
        });
    }

    function openCategory(category) {
        selectedCategory = {
            id: category.id,
            name: category.name,
            startIndex: 0,
            limit: categoryPageSize()
        };
        categoryLandingContainer().classList.add('hide');
        categoryChannelContainer().classList.remove('hide');
        categoryChannelContainer().querySelector('.liveTvCategoryName').textContent = category.name;
        loadCategoryChannels();
    }

    function onNextCategoryPage() {
        if (!selectedCategory || categoryRequestPending) {
            return;
        }

        selectedCategory.startIndex += selectedCategory.limit;
        loadCategoryChannels().then(() => window.scrollTo(0, 0));
    }

    function onPreviousCategoryPage() {
        if (!selectedCategory || categoryRequestPending) {
            return;
        }

        selectedCategory.startIndex = Math.max(0, selectedCategory.startIndex - selectedCategory.limit);
        loadCategoryChannels().then(() => window.scrollTo(0, 0));
    }

    function onCategoryClick(event) {
        const button = event.target.closest('button[data-category-id]');
        if (!button) {
            return;
        }

        if (button.dataset.categoryId === ALL_CHANNELS_ID) {
            mainTabsManager.selectedTabIndex(2);
            return;
        }

        const category = categoryMap.get(button.dataset.categoryId);
        if (category) {
            openCategory(category);
        }
    }

    function onInputCommand(evt) {
        if (evt.detail.command === 'search') {
            evt.preventDefault();
            Dashboard.navigate('search?collectionType=livetv');
        }
    }

    const self = this;
    let currentTabIndex = parseInt(params.tab || getDefaultTabIndex('livetv'), 10);
    let initialTabIndex = currentTabIndex;
    let currentTabController;
    let selectedCategory;
    let categoryMap = new Map();
    let categoryRequestPending = false;
    const tabControllers = [];
    const renderedTabs = [];

    self.initTab = function () {
        categoryListContainer().addEventListener('click', onCategoryClick);
        categoryChannelContainer().querySelector('.btnCategoryBack').addEventListener('click', returnToCategoryList);
    };

    self.renderTab = function () {
        loadCategories();
    };

    view.addEventListener('viewbeforeshow', function () {
        initTabs();
    });
    view.addEventListener('viewshow', function (evt) {
        if (!evt.detail.isRestored) {
            mainTabsManager.selectedTabIndex(initialTabIndex);
        }

        inputManager.on(window, onInputCommand);
    });
    view.addEventListener('viewbeforehide', function () {
        if (currentTabController?.onHide) {
            currentTabController.onHide();
        }

        inputManager.off(window, onInputCommand);
    });
    view.addEventListener('viewdestroy', function () {
        tabControllers.forEach(function (tabController) {
            if (tabController.destroy) {
                tabController.destroy();
            }
        });
    });
}
