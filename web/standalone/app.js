/* Plain ES5, owned SVGs, and public HTTP APIs: no Jellyfin Web imports. */
(function () {
    'use strict';
    var core = window.LiveTvCategoriesCore;
    var base = core.basePath(window.location.pathname);
    var storageKey = 'ltvc.standalone.session.v1:' + base;
    var session = null;
    var categoryEntries = [];
    var selectedCategory = null;
    var startIndex = 0;
    var channelFocusId = '';
    var categoryFocusId = '';
    var totalChannels = 0;
    var requestGeneration = 0;
    var pendingRequest = null;
    var retryAction = null;
    var deviceId = 'ltvc-' + String(new Date().getTime()) + '-' + Math.random().toString(36).slice(2);

    function el(id) { return document.getElementById(id); }
    function empty(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function text(node, value) { node.textContent = value; }
    function focus(node) { if (node && !node.disabled && !node.hidden) node.focus(); }
    function storedValue() { try { return window.sessionStorage.getItem(storageKey); } catch (ignore) { return null; } }
    function save() {
        if (!session) return;
        session.view = {
            category: selectedCategory,
            startIndex: startIndex,
            channelFocusId: channelFocusId,
            categoryFocusId: categoryFocusId
        };
        try { window.sessionStorage.setItem(storageKey, JSON.stringify(session)); } catch (ignore) { /* Memory-only is safe. */ }
    }

    function message(value, retry) {
        text(el('error'), value || '');
        el('error-panel').hidden = !value;
        retryAction = retry || null;
        el('retry').hidden = !retryAction;
    }

    function loading(value) { text(el('status'), value || ''); }

    function historyState(push) {
        var value = { ltvc: true, category: selectedCategory, startIndex: startIndex, channelFocusId: channelFocusId, categoryFocusId: categoryFocusId };
        try {
            window.history[push ? 'pushState' : 'replaceState'](value, '', window.location.href);
        } catch (ignore) { /* Browsing and the explicit Back button still work. */ }
    }

    function showLogin() {
        el('login-view').hidden = false;
        el('categories-view').hidden = true;
        el('channels-view').hidden = true;
        el('sign-out').hidden = true;
        el('sign-in').disabled = false;
        text(el('account-name'), '');
    }

    function clearSession(note) {
        requestGeneration += 1;
        if (pendingRequest) pendingRequest.abort();
        pendingRequest = null;
        session = null;
        selectedCategory = null;
        categoryEntries = [];
        channelFocusId = '';
        categoryFocusId = '';
        try { window.sessionStorage.removeItem(storageKey); } catch (ignore) { /* No persistent fallback. */ }
        empty(el('categories-list'));
        empty(el('channels-list'));
        el('password').value = '';
        loading('');
        showLogin();
        historyState(false);
        message(note || '');
        focus(el('username'));
    }

    function request(method, path, body, callback) {
        var generation = ++requestGeneration;
        var xhr;
        if (pendingRequest) pendingRequest.abort();
        xhr = new XMLHttpRequest();
        pendingRequest = xhr;
        xhr.open(method, path, true);
        xhr.timeout = 20000;
        xhr.setRequestHeader('Authorization', core.authHeader(session && session.token, session ? session.deviceId : deviceId));
        xhr.setRequestHeader('Accept', 'application/json');
        if (body) xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
            var payload = null;
            if (generation !== requestGeneration) return;
            pendingRequest = null;
            if (xhr.status === 401 && session) {
                clearSession('Your Jellyfin session expired. Please sign in again.');
                return;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                try { payload = JSON.parse(xhr.responseText); } catch (ignore) {
                    callback({ status: xhr.status, invalidResponse: true });
                    return;
                }
                callback(null, payload);
            } else callback({ status: xhr.status });
        };
        xhr.onerror = xhr.ontimeout = function () {
            if (generation !== requestGeneration) return;
            pendingRequest = null;
            callback({ status: 0 });
        };
        xhr.send(body ? JSON.stringify(body) : null);
    }

    function errorText(error, subject) {
        if (error.status === 403) return 'Your Jellyfin account does not have permission to access Live TV.';
        if (error.status === 404) return subject + ' is no longer available. Refresh the categories or use normal Jellyfin.';
        if (error.status === 0) return 'The server could not be reached. Check your connection and try again.';
        return subject + ' could not be loaded. You can still open normal Jellyfin.';
    }

    function icon(kind) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        var paths = {
            category: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
            channel: 'M3 6h18v14H3zM8 2l4 4 4-4M7 16h10'
        };
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        path.setAttribute('d', paths[kind]);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.7');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
        return svg;
    }

    function card(tag, name, subtitle, kind) {
        var node = document.createElement(tag);
        var title = document.createElement('span');
        var description = document.createElement('span');
        node.className = 'card';
        title.className = 'card-name';
        description.className = 'card-subtitle';
        text(title, name);
        text(description, subtitle);
        node.appendChild(icon(kind));
        node.appendChild(title);
        node.appendChild(description);
        return node;
    }

    function focusCard(listId, attribute, id) {
        var nodes = el(listId).children;
        var i;
        for (i = 0; i < nodes.length; i += 1) {
            if (nodes[i].getAttribute(attribute) === id) { focus(nodes[i]); return; }
        }
        focus(nodes[0]);
    }

    function renderCategories() {
        var i;
        var entry;
        var button;
        empty(el('categories-list'));
        for (i = 0; i < categoryEntries.length; i += 1) {
            entry = categoryEntries[i];
            button = card('button', entry.name, entry.allChannels ? 'Browse every available channel' :
                entry.channelCount + (entry.channelCount === 1 ? ' channel' : ' channels'), 'category');
            button.type = 'button';
            button.setAttribute('data-category-id', entry.id);
            button.setAttribute('aria-label', entry.name + ', ' + (entry.allChannels ?
                'browse every available channel' : entry.channelCount + (entry.channelCount === 1 ? ' channel' : ' channels')));
            button.onclick = (function (category) {
                return function () {
                    categoryFocusId = category.id;
                    channelFocusId = '';
                    selectedCategory = category;
                    startIndex = 0;
                    historyState(true);
                    loadChannels();
                };
            }(entry));
            el('categories-list').appendChild(button);
        }
        el('login-view').hidden = true;
        el('channels-view').hidden = true;
        el('categories-view').hidden = false;
        el('sign-out').hidden = false;
        text(el('account-name'), session.userName ? 'Signed in as ' + session.userName : 'Signed in to Jellyfin');
        focusCard('categories-list', 'data-category-id', categoryFocusId);
    }

    function loadCategories(warning, fallbackOnly) {
        if (fallbackOnly) {
            categoryEntries = [core.ALL_CHANNELS];
            loading('');
            renderCategories();
            message(warning);
            save();
            return;
        }
        loading('Loading categories…');
        request('GET', base + '/LiveTvCategories', null, function (error, payload) {
            var categories;
            loading('');
            if (!error) {
                try { categories = core.categories(payload); } catch (invalid) { error = { status: 200, invalidResponse: true }; }
            }
            if (error && error.status === 403) {
                categoryEntries = [];
                renderCategories();
                message(errorText(error, 'Categories'), function () { loadCategories(); });
                return;
            }
            categoryEntries = [core.ALL_CHANNELS].concat(categories || []);
            renderCategories();
            message(error ? errorText(error, 'Categories') + ' Try All channels instead.' : warning,
                error ? function () { loadCategories(); } : null);
            save();
        });
    }

    function checkCompatibility(restoreChannels) {
        loading('Checking category API…');
        request('GET', base + '/LiveTvCategories/Compatibility', null, function (error, payload) {
            if (!error && payload && String(payload.apiContractVersion) !== '1') {
                selectedCategory = null;
                loadCategories('This category API version is not supported by this page. Use All channels or normal Jellyfin.', true);
                return;
            }
            if (error && error.status === 403) {
                selectedCategory = null;
                categoryEntries = [];
                loading('');
                renderCategories();
                message(errorText(error, 'Categories'));
                return;
            }
            if (restoreChannels && selectedCategory) loadChannels();
            else loadCategories();
        });
    }

    function loadChannels() {
        var category = selectedCategory;
        var requestedStart = startIndex;
        if (!category || !session) return;
        el('login-view').hidden = true;
        el('categories-view').hidden = true;
        el('channels-view').hidden = false;
        el('sign-out').hidden = false;
        el('previous-page').disabled = true;
        el('next-page').disabled = true;
        empty(el('channels-list'));
        text(el('channels-title'), category.name);
        text(el('page-summary'), '');
        message('');
        loading('Loading channels…');
        save();
        request('GET', core.channelsUrl(base, category, requestedStart, session.userId), null, function (error, payload) {
            var page;
            var i;
            var channel;
            var link;
            loading('');
            if (!error) {
                try { page = core.channelPage(payload); } catch (invalid) { error = { status: 200, invalidResponse: true }; }
            }
            if (error) {
                message(errorText(error, 'Channels'), loadChannels);
                focus(el('category-back'));
                return;
            }
            totalChannels = page.total;
            if (!page.items.length && requestedStart >= page.total && page.total > 0) {
                startIndex = Math.floor((page.total - 1) / core.PAGE_SIZE) * core.PAGE_SIZE;
                historyState(false);
                loadChannels();
                return;
            }
            for (i = 0; i < page.items.length; i += 1) {
                channel = page.items[i];
                link = card('a', channel.name, (channel.number ? channel.number + ' · ' : '') +
                    (channel.program || 'Open channel in Jellyfin'), 'channel');
                link.href = core.channelDetailsUrl(base, channel.id, session.serverId);
                link.setAttribute('data-channel-id', channel.id);
                link.onclick = (function (id) {
                    return function () { channelFocusId = id; save(); historyState(false); };
                }(channel.id));
                el('channels-list').appendChild(link);
            }
            text(el('page-summary'), page.total ? (page.items.length ? 'Channels ' + (requestedStart + 1) + '–' +
                Math.min(requestedStart + page.items.length, page.total) + ' of ' + page.total :
                'No channels returned on this page (' + page.total + ' available)') : 'No channels in this category');
            el('previous-page').disabled = requestedStart === 0;
            el('next-page').disabled = requestedStart + core.PAGE_SIZE >= page.total;
            save();
            historyState(false);
            if (page.items.length) focusCard('channels-list', 'data-channel-id', channelFocusId);
            else focus(el('category-back'));
        });
    }

    function backToCategories() {
        selectedCategory = null;
        startIndex = 0;
        channelFocusId = '';
        save();
        historyState(false);
        loadCategories();
    }

    el('jellyfin-link').href = base + '/web/index.html';
    el('login-form').onsubmit = function (event) {
        var credentials;
        event.preventDefault();
        credentials = { Username: el('username').value, Pw: el('password').value };
        if (!credentials.Username) { focus(el('username')); return; }
        el('sign-in').disabled = true;
        message('');
        loading('Signing in…');
        request('POST', base + '/Users/AuthenticateByName', credentials, function (error, payload) {
            el('password').value = '';
            el('sign-in').disabled = false;
            if (error || !payload || !payload.AccessToken || !payload.User || !payload.User.Id) {
                loading('');
                message(error && (error.status === 401 || error.status === 400) ?
                    'Sign-in failed. Check your username and password.' : 'Could not sign in to Jellyfin. Check your connection or open normal Jellyfin.');
                focus(el('password'));
                return;
            }
            session = core.readSession(JSON.stringify({ token: payload.AccessToken, userId: payload.User.Id,
                userName: payload.User.Name, serverId: payload.ServerId, deviceId: deviceId }));
            if (!session) { loading(''); message('Jellyfin returned an unsupported session. Open normal Jellyfin.'); return; }
            save();
            historyState(false);
            checkCompatibility(false);
        });
        credentials.Pw = '';
        el('password').value = '';
    };
    el('sign-out').onclick = function () {
        var logout;
        if (session) {
            // Best effort: revoke only this page's token. Clear local state even
            // when a future server changes the logout endpoint or is offline.
            try {
                logout = new XMLHttpRequest();
                logout.open('POST', base + '/Sessions/Logout', true);
                logout.timeout = 10000;
                logout.setRequestHeader('Authorization', core.authHeader(session.token, session.deviceId));
                logout.send(null);
            } catch (ignore) { /* Sign-out must not depend on the connection. */ }
        }
        clearSession('You have signed out of this category browser.');
    };
    el('retry').onclick = function () { if (retryAction) retryAction(); };
    el('category-back').onclick = backToCategories;
    el('previous-page').onclick = function () {
        if (startIndex > 0) { startIndex = Math.max(0, startIndex - core.PAGE_SIZE); channelFocusId = ''; loadChannels(); }
    };
    el('next-page').onclick = function () {
        if (startIndex + core.PAGE_SIZE < totalChannels) { startIndex += core.PAGE_SIZE; channelFocusId = ''; loadChannels(); }
    };
    window.addEventListener('popstate', function (event) {
        var state = event.state;
        if (!session || !state || !state.ltvc) return;
        selectedCategory = state.category || null;
        startIndex = state.startIndex || 0;
        channelFocusId = state.channelFocusId || '';
        categoryFocusId = state.categoryFocusId || '';
        save();
        if (selectedCategory) loadChannels();
        else loadCategories();
    });
    window.addEventListener('pageshow', function (event) {
        // A restored page can outlive its server session. Revalidate instead of
        // displaying a stale protected view from the browser's Back cache.
        if (event.persisted && session) checkCompatibility(true);
    });
    window.addEventListener('pagehide', save);
    document.addEventListener('focusin', function (event) {
        var node = event.target;
        if (node.getAttribute('data-channel-id')) channelFocusId = node.getAttribute('data-channel-id');
        if (node.getAttribute('data-category-id')) categoryFocusId = node.getAttribute('data-category-id');
    });
    document.addEventListener('keydown', function (event) {
        var key = event.keyCode;
        var active = document.activeElement;
        var nodes;
        var origin;
        var candidate;
        var best = null;
        var bestScore = Infinity;
        var dx;
        var dy;
        var score;
        var i;
        if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return;
        if (selectedCategory && (key === 8 || key === 27 || key === 461 || key === 10009)) {
            event.preventDefault();
            backToCategories();
            return;
        }
        if (key < 37 || key > 40 || !active) return;
        origin = active.getBoundingClientRect();
        nodes = document.querySelectorAll('button, a[href]');
        for (i = 0; i < nodes.length; i += 1) {
            if (nodes[i] === active || nodes[i].disabled || !nodes[i].getClientRects().length) continue;
            candidate = nodes[i].getBoundingClientRect();
            dx = candidate.left + candidate.width / 2 - origin.left - origin.width / 2;
            dy = candidate.top + candidate.height / 2 - origin.top - origin.height / 2;
            if ((key === 37 && dx >= -1) || (key === 39 && dx <= 1) ||
                    (key === 38 && dy >= -1) || (key === 40 && dy <= 1)) continue;
            score = key === 37 || key === 39 ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
            if (score < bestScore) { best = nodes[i]; bestScore = score; }
        }
        if (best) { event.preventDefault(); focus(best); }
    });

    session = core.readSession(storedValue());
    if (session) {
        selectedCategory = session.view.category;
        startIndex = session.view.startIndex;
        channelFocusId = session.view.channelFocusId;
        categoryFocusId = session.view.categoryFocusId;
        historyState(false);
        checkCompatibility(true);
    } else {
        showLogin();
        historyState(false);
    }
}());
