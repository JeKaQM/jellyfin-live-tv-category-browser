/* Standalone compatibility boundary. Deliberately ES5 and dependency-free. */
(function (root, factory) {
    'use strict';
    var core = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = core;
    } else {
        root.LiveTvCategoriesCore = core;
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';
    var PAGE_SIZE = 100;
    var ALL_CHANNELS = { id: 'all-channels', name: 'All channels', channelCount: null, allChannels: true };

    function string(value) {
        return typeof value === 'string' ? value : '';
    }

    function integer(value) {
        return typeof value === 'number' && isFinite(value) && value >= 0 && Math.floor(value) === value;
    }

    function basePath(pathname) {
        var match = string(pathname).match(/^(.*?)\/LiveTvCategories\/ui(?:\/(?:index\.html)?)?$/i);
        if (!match || /^\/\//.test(match[1])) throw new Error('This page must be served from LiveTvCategories/ui/.');
        return match[1];
    }

    function authHeader(token, deviceId) {
        var header = 'MediaBrowser Client="Live TV Categories", Device="Independent browser", DeviceId="' +
            String(deviceId).replace(/[^a-zA-Z0-9_-]/g, '') + '", Version="1.0"';
        if (token) {
            if (!/^[\x21-\x7e]+$/.test(token) || /["\\]/.test(token)) {
                throw new Error('Invalid session token.');
            }
            header += ', Token="' + token + '"';
        }
        return header;
    }

    function categories(payload) {
        var source = Array.isArray(payload) ? payload : payload && payload.Items;
        var result = [];
        var ids = Object.create(null);
        var i;
        var value;
        if (!Array.isArray(source)) throw new Error('The category API returned an unsupported response.');
        for (i = 0; i < source.length; i += 1) {
            value = source[i];
            if (!value || !string(value.id) || !string(value.name) || !integer(value.channelCount) ||
                    Object.prototype.hasOwnProperty.call(ids, value.id) || value.id === ALL_CHANNELS.id) continue;
            ids[value.id] = true;
            result.push({ id: value.id, name: value.name, channelCount: value.channelCount, allChannels: false });
        }
        result.sort(function (a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        return result;
    }

    function channelPage(payload) {
        var items = [];
        var i;
        var value;
        if (!payload || !Array.isArray(payload.Items) || !integer(payload.TotalRecordCount)) {
            throw new Error('The channel API returned an unsupported response.');
        }
        for (i = 0; i < payload.Items.length; i += 1) {
            value = payload.Items[i];
            if (!value || !string(value.Id) || !string(value.Name)) continue;
            items.push({
                id: value.Id,
                name: value.Name,
                number: string(value.Number),
                program: value.CurrentProgram ? string(value.CurrentProgram.Name) : ''
            });
        }
        return { items: items, total: payload.TotalRecordCount };
    }

    function query(values) {
        var pairs = [];
        var key;
        for (key in values) {
            if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== undefined) {
                pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(values[key])));
            }
        }
        return pairs.join('&');
    }

    function channelsUrl(base, category, startIndex, userId) {
        var path = category.allChannels ? '/LiveTv/Channels' :
            '/LiveTvCategories/' + encodeURIComponent(category.id) + '/Channels';
        return base + path + '?' + query({
            userId: category.allChannels ? userId : undefined,
            startIndex: integer(startIndex) ? startIndex : 0,
            limit: PAGE_SIZE,
            addCurrentProgram: true,
            enableTotalRecordCount: true
        });
    }

    /* Jellyfin's public Web handoff is the only Web-specific assumption here. */
    function channelDetailsUrl(base, itemId, serverId) {
        if (!string(itemId)) throw new Error('Missing channel ID.');
        return base + '/web/index.html#/details?' + query({ id: itemId, serverId: string(serverId) || undefined });
    }

    function readSession(value) {
        var session;
        var view;
        var category;
        try { session = JSON.parse(value); } catch (ignore) { return null; }
        if (!session || !string(session.token) || !string(session.userId) || !string(session.deviceId)) return null;
        try { authHeader(session.token, session.deviceId); } catch (ignoreHeader) { return null; }
        view = session.view || {};
        category = view.category;
        if (!category || !string(category.id) || !string(category.name)) category = null;
        if (category) category = {
            id: category.id,
            name: category.name,
            allChannels: category.id === ALL_CHANNELS.id && category.allChannels === true
        };
        return {
            token: session.token,
            userId: session.userId,
            userName: string(session.userName),
            serverId: string(session.serverId),
            deviceId: session.deviceId,
            view: {
                category: category,
                startIndex: integer(view.startIndex) ? Math.floor(view.startIndex / PAGE_SIZE) * PAGE_SIZE : 0,
                channelFocusId: string(view.channelFocusId),
                categoryFocusId: string(view.categoryFocusId)
            }
        };
    }

    return {
        PAGE_SIZE: PAGE_SIZE,
        ALL_CHANNELS: ALL_CHANNELS,
        basePath: basePath,
        authHeader: authHeader,
        categories: categories,
        channelPage: channelPage,
        channelsUrl: channelsUrl,
        channelDetailsUrl: channelDetailsUrl,
        readSession: readSession
    };
}));
