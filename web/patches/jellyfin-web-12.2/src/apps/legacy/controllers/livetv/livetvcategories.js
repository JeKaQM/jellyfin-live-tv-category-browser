import adapter from './livetvcategoriesAdapter';
import { categoryPageSize, normalizeCategories } from './livetvcategoriesModel';
import { categoryIcon, createIcon } from './livetvcategoriesIcons';
import template from './livetvcategories.template.html';

import './livetvcategories.scss';

const ALL_CHANNELS_ID = 'all-channels';

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

function createCategoryRow(documentRef, category) {
    const row = documentRef.createElement('div');
    row.className = 'liveTvCategoryCard';

    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'button-flat liveTvCategoryButton';
    button.dataset.categoryId = category.id;
    button.setAttribute(
        'aria-label',
        category.channelCount === null ?
            category.name :
            `${category.name}, ${category.channelCount.toLocaleString()} channels`);

    const icon = documentRef.createElement('span');
    icon.className = 'liveTvCategoryIcon';
    icon.appendChild(createIcon(documentRef, categoryIcon(category)));

    const copy = documentRef.createElement('span');
    copy.className = 'liveTvCategoryCopy';

    const heading = documentRef.createElement('span');
    heading.className = 'liveTvCategoryCardName';
    heading.textContent = category.name;

    const count = documentRef.createElement('span');
    count.className = 'liveTvCategoryCardCount';
    count.textContent = category.channelCount === null ?
        'Browse the complete channel list' :
        `${category.channelCount.toLocaleString()} channels`;

    const chevron = createIcon(documentRef, 'next');
    chevron.classList.add('liveTvCategoryChevron');

    copy.appendChild(heading);
    copy.appendChild(count);
    button.appendChild(icon);
    button.appendChild(copy);
    button.appendChild(chevron);
    row.appendChild(button);
    return row;
}

export default function LiveTvCategoriesController(view, params, tabContent) {
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
        categoryChannelContainer().classList.add('hide');
        categoryLandingContainer().classList.remove('hide');
    }

    function showSelectedCategory() {
        if (!selectedCategory) {
            showCategoryList();
            return;
        }

        categoryLandingContainer().classList.add('hide');
        categoryChannelContainer().classList.remove('hide');
        categoryChannelContainer().querySelector('.liveTvCategoryName').textContent = selectedCategory.name;
    }

    function focusContainer(container) {
        if (active) adapter.focusContainer(container);
    }

    function focusCategoryButton(categoryId) {
        const button = Array.from(categoryListContainer().querySelectorAll('button[data-category-id]'))
            .find(candidate => candidate.dataset.categoryId === categoryId);

        if (button) {
            button.focus();
        } else {
            focusContainer(categoryListContainer());
        }
    }

    function restoreCategoryFocus() {
        if (lastFocusedChannelElement?.isConnected
            && categoryChannelContainer().contains(lastFocusedChannelElement)) {
            lastFocusedChannelElement.focus();
        } else {
            focusContainer(categoryChannelContainer());
        }
    }

    function cancelCategoryChannelRequest() {
        categoryRequestId += 1;
        if (categoryRequestPending) {
            categoryRequestPending = false;
            adapter.loading.hide();
        }
    }

    function returnToCategoryList() {
        const categoryId = selectedCategory?.id;
        cancelCategoryChannelRequest();
        selectedCategory = null;
        lastFocusedChannelElement = null;
        showCategoryList();
        focusCategoryButton(categoryId);
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
        summary.textContent = error ?
            'Category service unavailable' :
            `${categories.length.toLocaleString()} categories \u00b7 ${totalChannels.toLocaleString()} channels`;

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
        categoryLoadState = 'ready';

        if (selectedCategory) {
            showSelectedCategory();
        } else {
            showCategoryList();
        }
    }

    function completeCategoryListLoad() {
        adapter.loading.hide();
    }

    function loadCategories() {
        if (categoryLoadState !== 'idle') {
            if (selectedCategory) {
                showSelectedCategory();
            } else {
                showCategoryList();
            }

            return Promise.resolve();
        }

        categoryLoadState = 'loading';
        adapter.loading.show();
        return adapter.getCategories().then(payload => {
            if (categoryLoadState !== 'loading') return;
            try {
                renderCategoryList(normalizeCategories(payload), null);
            } catch (error) {
                renderCategoryList([], error);
            }

            completeCategoryListLoad();
            if (!selectedCategory) {
                focusContainer(categoryListContainer());
            }
        }, () => {
            if (categoryLoadState !== 'loading') return;
            renderCategoryList([], true);
            completeCategoryListLoad();
            if (!selectedCategory) {
                focusContainer(categoryListContainer());
            }
        });
    }

    function renderCategoryPaging(result) {
        const context = categoryChannelContainer();
        for (const element of context.querySelectorAll('.paging')) {
            clearElement(element);
            const { startIndex, limit } = selectedCategory;
            const total = result.TotalRecordCount;
            if (total <= limit) continue;
            const count = context.ownerDocument.createElement('span');
            count.textContent = `${total ? startIndex + 1 : 0}–${Math.min(startIndex + result.Items.length, total)} / ${total}`;
            element.appendChild(count);
            for (const direction of ['Previous', 'Next']) {
                const button = context.ownerDocument.createElement('button');
                button.type = 'button';
                button.className = `button-flat btn${direction}Page`;
                button.setAttribute('aria-label', `${direction} page`);
                button.disabled = direction === 'Previous' ? startIndex === 0 : startIndex + limit >= total;
                button.appendChild(createIcon(context.ownerDocument, direction.toLowerCase()));
                element.appendChild(button);
            }
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
        items.innerHTML = adapter.channelCards(result.Items);
        adapter.loadImages(items);
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

    function isCurrentCategoryRequest(requestId, category) {
        return requestId === categoryRequestId
            && selectedCategory?.id === category.id
            && selectedCategory.startIndex === category.startIndex
            && selectedCategory.limit === category.limit;
    }

    function finishCategoryRequest(requestId) {
        if (requestId === categoryRequestId) {
            categoryRequestPending = false;
            adapter.loading.hide();
        }
    }

    function loadCategoryChannels() {
        if (!selectedCategory || categoryRequestPending) {
            return Promise.resolve();
        }

        const category = { ...selectedCategory };
        const requestId = ++categoryRequestId;
        categoryRequestPending = true;
        adapter.loading.show();
        return adapter.getCategoryChannels(category).then(result => {
            if (!isCurrentCategoryRequest(requestId, category)) {
                return;
            }

            if (!result || !Array.isArray(result.Items)
                || !Number.isInteger(result.TotalRecordCount) || result.TotalRecordCount < 0) {
                renderCategoryChannelError();
            } else {
                renderCategoryChannels(result);
            }

            finishCategoryRequest(requestId);
        }, () => {
            if (!isCurrentCategoryRequest(requestId, category)) {
                return;
            }

            renderCategoryChannelError();
            finishCategoryRequest(requestId);
        });
    }

    function openCategory(category) {
        cancelCategoryChannelRequest();
        selectedCategory = {
            id: category.id,
            name: category.name,
            startIndex: 0,
            limit: categoryPageSize(adapter.pageSize())
        };
        lastFocusedChannelElement = null;
        showSelectedCategory();
        loadCategoryChannels();
    }

    function onNextCategoryPage() {
        if (!selectedCategory || categoryRequestPending) {
            return;
        }

        selectedCategory.startIndex += selectedCategory.limit;
        lastFocusedChannelElement = null;
        loadCategoryChannels().then(() => window.scrollTo(0, 0));
    }

    function onPreviousCategoryPage() {
        if (!selectedCategory || categoryRequestPending) {
            return;
        }

        selectedCategory.startIndex = Math.max(0, selectedCategory.startIndex - selectedCategory.limit);
        lastFocusedChannelElement = null;
        loadCategoryChannels().then(() => window.scrollTo(0, 0));
    }

    function onCategoryClick(event) {
        const button = event.target.closest('button[data-category-id]');
        if (!button) {
            return;
        }

        if (button.dataset.categoryId === ALL_CHANNELS_ID) {
            adapter.showAllChannels();
            return;
        }

        const category = categoryMap.get(button.dataset.categoryId);
        if (category) {
            openCategory(category);
        }
    }

    function onCategoryChannelFocus(event) {
        lastFocusedChannelElement = event.target;
    }

    function onInputCommand(event) {
        if (event.detail.command === 'back' && selectedCategory) {
            event.preventDefault();
            returnToCategoryList();
        }
    }

    let selectedCategory;
    let lastFocusedChannelElement;
    let categoryMap = new Map();
    let categoryLoadState = 'idle';
    let categoryRequestPending = false;
    let categoryRequestId = 0;
    let listening = false;
    let active = false;

    this.initTab = function () {
        tabContent.innerHTML = template;
        tabContent.querySelector('.liveTvCategoryBackIcon').appendChild(createIcon(view.ownerDocument, 'back'));
        categoryListContainer().addEventListener('click', onCategoryClick);
        categoryChannelContainer().addEventListener('focusin', onCategoryChannelFocus);
        categoryChannelContainer().querySelector('.btnCategoryBack').addEventListener('click', returnToCategoryList);
    };

    this.onShow = function () {
        active = true;
        if (!listening) {
            adapter.onInput(onInputCommand);
            listening = true;
        }
        if (selectedCategory) {
            showSelectedCategory();
            restoreCategoryFocus();
        } else {
            showCategoryList();
        }
    };

    this.renderTab = function () {
        this.onShow();
        return loadCategories();
    };

    this.onHide = function () {
        active = false;
        const activeElement = view.ownerDocument.activeElement;
        if (activeElement && categoryChannelContainer().contains(activeElement)) {
            lastFocusedChannelElement = activeElement;
        }
        adapter.offInput(onInputCommand);
        listening = false;
    };

    this.destroy = function () {
        this.onHide();
        if (categoryLoadState === 'loading') adapter.loading.hide();
        categoryLoadState = 'destroyed';
        cancelCategoryChannelRequest();
        categoryListContainer().removeEventListener('click', onCategoryClick);
        categoryChannelContainer().removeEventListener('focusin', onCategoryChannelFocus);
        categoryChannelContainer().querySelector('.btnCategoryBack').removeEventListener('click', returnToCategoryList);
    };
}

