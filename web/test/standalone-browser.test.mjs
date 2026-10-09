import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const coreSource = readFileSync(new URL('../standalone/browser-core.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../standalone/app.js', import.meta.url), 'utf8');

function core() {
    const context = { module: { exports: {} } };
    vm.runInNewContext(coreSource, context);
    return context.module.exports;
}

test('standalone URL adapter preserves BaseUrl and cannot use a network-path prefix', () => {
    const adapter = core();
    assert.equal(adapter.basePath('/LiveTvCategories/ui/'), '');
    assert.equal(adapter.basePath('/jellyfin/LiveTvCategories/ui'), '/jellyfin');
    assert.equal(adapter.basePath('/jellyfin/LiveTvCategories/ui/index.html'), '/jellyfin');
    assert.throws(() => adapter.basePath('//other-server/LiveTvCategories/ui/'));
    assert.throws(() => adapter.basePath('/LiveTvCategories/ui/unknown.html'));
});

test('standalone authentication uses modern headers and rejects header injection', () => {
    const adapter = core();
    assert.match(adapter.authHeader('token-123', 'device'), /^MediaBrowser Client=/);
    assert.match(adapter.authHeader('token-123', 'device'), /Token="token-123"$/);
    assert.doesNotMatch(adapter.authHeader(null, 'device'), /Token=/);
    for (const token of ['token\r\nInjected: yes', 'token"', 'token\\']) {
        assert.throws(() => adapter.authHeader(token, 'device'));
    }
});

test('category adapter validates, deduplicates prototype-like IDs and preserves Unicode names', () => {
    const result = core().categories({ Items: [
        { id: '__proto__', name: 'Café & <img>', channelCount: 2 },
        { id: '__proto__', name: 'Duplicate', channelCount: 2 },
        { id: 'valid', name: 'News', channelCount: 1 },
        { id: 'bad', name: 'Invalid', channelCount: -1 },
        { id: 'all-channels', name: 'Impersonated all channels', channelCount: 1 }
    ] });
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'Café & <img>');
    assert.throws(() => core().categories({ Unexpected: [] }));
});

test('channel adapters encode opaque IDs and page ordinary and category channels at 100', () => {
    const adapter = core();
    const categoryUrl = new URL(adapter.channelsUrl('/jellyfin', { id: 'x/体育 & ?' }, 100, 'user'), 'https://server');
    assert.equal(categoryUrl.pathname, '/jellyfin/LiveTvCategories/x%2F%E4%BD%93%E8%82%B2%20%26%20%3F/Channels');
    assert.equal(categoryUrl.searchParams.get('limit'), '100');
    assert.equal(categoryUrl.searchParams.get('startIndex'), '100');
    assert.equal(categoryUrl.searchParams.has('userId'), false);
    const allUrl = new URL(adapter.channelsUrl('/jellyfin', adapter.ALL_CHANNELS, 0, 'u&foreign=1'), 'https://server');
    assert.equal(allUrl.pathname, '/jellyfin/LiveTv/Channels');
    assert.equal(allUrl.searchParams.get('userId'), 'u&foreign=1');
});

test('standard Web handoff encodes IDs without putting credentials in URLs', () => {
    const url = core().channelDetailsUrl('/jellyfin', 'id&Token=secret', 'server/id');
    assert.equal(url, '/jellyfin/web/index.html#/details?id=id%26Token%3Dsecret&serverId=server%2Fid');
    assert.throws(() => core().channelDetailsUrl('', '', 'server'));
});

test('session parsing is defensive and never restores arbitrary credentials', () => {
    const adapter = core();
    assert.equal(adapter.readSession('{broken'), null);
    assert.equal(adapter.readSession(JSON.stringify({ token: 'x\r\n', userId: 'u', deviceId: 'd' })), null);
    const session = adapter.readSession(JSON.stringify({
        token: 'token', userId: 'u', deviceId: 'd', password: 'do not restore', apiKey: 'also not',
        view: { category: { id: 'news', name: 'News', allChannels: true }, startIndex: 153, channelFocusId: 'channel' }
    }));
    assert.equal(session.view.startIndex, 100);
    assert.equal(session.view.category.allChannels, false);
    assert.equal(session.password, undefined);
    assert.equal(session.apiKey, undefined);
});

// Tiny DOM fixture deliberately refuses innerHTML so actual application flows
// fail immediately if untrusted category or channel content switches to HTML.
function application(path = '/jellyfin/LiveTvCategories/ui/', initialSession) {
    const requests = [];
    const storage = new Map();
    const documentEvents = {};
    const windowEvents = {};
    const elements = {};
    const document = { activeElement: null };
    class Element {
        constructor(tag = 'DIV') {
            this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {};
            this.hidden = false; this.disabled = false; this.value = ''; this.textContent = '';
        }
        get innerHTML() { throw new Error('HTML insertion is forbidden'); }
        set innerHTML(value) { throw new Error('HTML insertion is forbidden: ' + value); }
        get firstChild() { return this.children[0] || null; }
        appendChild(node) { this.children.push(node); return node; }
        removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
        setAttribute(key, value) { this.attributes[key] = String(value); }
        getAttribute(key) { return this.attributes[key] || null; }
        focus() { document.activeElement = this; documentEvents.focusin?.({ target: this }); }
        getClientRects() { return this.hidden ? [] : [{}]; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 50 }; }
    }
    for (const id of ['login-view', 'categories-view', 'channels-view', 'sign-out', 'sign-in',
        'account-name', 'error', 'error-panel', 'retry', 'status', 'username', 'password',
        'categories-list', 'channels-list', 'channels-title', 'page-summary', 'previous-page',
        'next-page', 'category-back', 'login-form', 'jellyfin-link']) {
        elements[id] = new Element(['username', 'password'].includes(id) ? 'INPUT' : 'DIV');
    }
    Object.assign(document, {
        getElementById: id => elements[id], createElement: tag => new Element(tag),
        createElementNS: (namespace, tag) => new Element(tag),
        addEventListener: (event, handler) => { documentEvents[event] = handler; },
        querySelectorAll: () => []
    });
    const base = core().basePath(path);
    const key = 'ltvc.standalone.session.v1:' + base;
    if (initialSession) storage.set(key, JSON.stringify(initialSession));
    const window = {
        location: { pathname: path, href: 'https://server' + path },
        sessionStorage: { getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        history: { pushState() {}, replaceState() {} },
        addEventListener: (event, handler) => { windowEvents[event] = handler; }
    };
    class Xhr {
        headers = {};
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader(key, value) { this.headers[key] = value; }
        send(body) { this.body = body; requests.push(this); }
        abort() { this.aborted = true; }
        respond(status, body) { this.status = status; this.responseText = JSON.stringify(body); this.onload(); }
    }
    const context = vm.createContext({ window, document, XMLHttpRequest: Xhr });
    vm.runInContext(coreSource, context);
    vm.runInContext(appSource, context);
    function next(suffix) {
        const request = requests.shift();
        assert.ok(request, `expected request ${suffix}`);
        assert.ok(request.url.includes(suffix), `${request.url} includes ${suffix}`);
        return request;
    }
    function login(categories = [{ id: 'news', name: 'News', channelCount: 201 }]) {
        elements.username.value = 'ordinary-user';
        elements.password.value = 'secret-password';
        elements['login-form'].onsubmit({ preventDefault() {} });
        const request = next('/Users/AuthenticateByName');
        assert.equal(JSON.parse(request.body).Pw, 'secret-password');
        assert.equal(elements.password.value, '');
        request.respond(200, { AccessToken: 'session-token', User: { Id: 'user-id', Name: 'ordinary-user' }, ServerId: 'server-id' });
        next('/Compatibility').respond(200, { apiContractVersion: '1' });
        next('/LiveTvCategories').respond(200, categories);
    }
    return { elements, storage, key, next, login, requests, document, documentEvents, windowEvents };
}

test('actual sign-in uses normal-user modern auth, renders names as text, and stores no password', () => {
    const app = application();
    app.login([{ id: 'unsafe', name: '<img src=x onerror=alert(1)> Café', channelCount: 2 }]);
    const button = app.elements['categories-list'].children[1];
    assert.equal(button.children[1].textContent, '<img src=x onerror=alert(1)> Café');
    assert.equal(app.elements['categories-view'].hidden, false);
    assert.equal(app.elements['jellyfin-link'].href, '/jellyfin/web/index.html');
    assert.doesNotMatch(app.storage.get(app.key), /secret-password|"Pw"|apiKey/);
    button.onclick();
    const request = app.next('/unsafe/Channels');
    assert.equal(request.headers['X-Emby-Token'], undefined);
    assert.match(request.headers.Authorization, /Token="session-token"/);
    request.respond(200, { Items: [{ Id: 'one', Name: '<script>bad()</script>', CurrentProgram: { Name: '<b>Programme</b>' } }], TotalRecordCount: 1 });
    const channel = app.elements['channels-list'].children[0];
    assert.equal(channel.children[1].textContent, '<script>bad()</script>');
    assert.equal(channel.children[2].textContent, '<b>Programme</b>');
});

test('actual paging, stock Web handoff and restored channel focus retain the category page', () => {
    const app = application(); app.login();
    app.elements['categories-list'].children[1].onclick();
    app.next('/news/Channels').respond(200, { Items: [{ Id: 'first', Name: 'First' }], TotalRecordCount: 201 });
    app.elements['next-page'].onclick();
    const request = app.next('startIndex=100');
    request.respond(200, { Items: [{ Id: 'second', Name: 'Second' }, { Id: 'third', Name: 'Third' }], TotalRecordCount: 201 });
    const channel = app.elements['channels-list'].children[1];
    channel.onclick();
    assert.equal(channel.href, '/jellyfin/web/index.html#/details?id=third&serverId=server-id');
    const saved = JSON.parse(app.storage.get(app.key));
    assert.equal(saved.view.startIndex, 100);
    assert.equal(saved.view.channelFocusId, 'third');
    const restored = application('/jellyfin/LiveTvCategories/ui/', saved);
    restored.next('/Compatibility').respond(200, { apiContractVersion: '1' });
    restored.next('startIndex=100').respond(200, { Items: [{ Id: 'second', Name: 'Second' }, { Id: 'third', Name: 'Third' }], TotalRecordCount: 201 });
    assert.equal(restored.document.activeElement.getAttribute('data-channel-id'), 'third');
    restored.elements['category-back'].onclick();
    restored.next('/LiveTvCategories').respond(200, [{ id: 'news', name: 'News', channelCount: 201 }]);
    assert.equal(restored.document.activeElement.getAttribute('data-category-id'), 'news');
});

test('expired sessions clear only owned storage and return to sign-in without leaking stale content', () => {
    const app = application(); app.login();
    app.storage.set('unrelated-session', 'keep');
    app.elements['categories-list'].children[1].onclick();
    app.next('/news/Channels').respond(401, {});
    assert.equal(app.elements['login-view'].hidden, false);
    assert.equal(app.elements['channels-list'].children.length, 0);
    assert.equal(app.storage.has(app.key), false);
    assert.equal(app.storage.get('unrelated-session'), 'keep');
    assert.match(app.elements.error.textContent, /session expired/);
});

test('sign-out clears owned session and does not alter normal Jellyfin login', () => {
    const app = application(); app.login();
    app.storage.set('jellyfin_credentials', 'independent');
    app.elements['sign-out'].onclick();
    const logout = app.next('/Sessions/Logout');
    assert.equal(logout.method, 'POST');
    assert.match(logout.headers.Authorization, /Token="session-token"/);
    assert.equal(app.storage.has(app.key), false);
    assert.equal(app.storage.get('jellyfin_credentials'), 'independent');
    assert.equal(app.elements['login-view'].hidden, false);
});

test('category API failure falls back to ordinary channel endpoint while 403 does not bypass permission', () => {
    const app = application(); app.login();
    app.elements['category-back'].onclick();
    app.next('/LiveTvCategories').respond(503, {});
    assert.equal(app.elements['categories-list'].children.length, 1);
    app.elements['categories-list'].children[0].onclick();
    const request = app.next('/LiveTv/Channels');
    assert.match(request.url, /userId=user-id/);
    request.respond(403, {});
    assert.match(app.elements.error.textContent, /permission/);
    assert.equal(app.elements['channels-list'].children.length, 0);
});

test('text-input Back key is never intercepted by TV category navigation', () => {
    const app = application(); app.login();
    app.elements['categories-list'].children[1].onclick();
    app.next('/news/Channels').respond(200, { Items: [], TotalRecordCount: 0 });
    app.elements.username.focus();
    let prevented = false;
    app.documentEvents.keydown({ keyCode: 8, preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    assert.equal(app.elements['channels-view'].hidden, false);
});

test('unsupported future API contracts stop category calls and retain standard All channels', () => {
    const app = application();
    app.elements.username.value = 'ordinary-user';
    app.elements['login-form'].onsubmit({ preventDefault() {} });
    app.next('/AuthenticateByName').respond(200, {
        AccessToken: 'session-token', User: { Id: 'user-id' }, ServerId: 'server-id'
    });
    app.next('/Compatibility').respond(200, { apiContractVersion: '99' });
    assert.equal(app.requests.length, 0);
    assert.equal(app.elements['categories-list'].children.length, 1);
    assert.match(app.elements.error.textContent, /not supported/);
    app.elements['categories-list'].children[0].onclick();
    assert.match(app.next('/LiveTv/Channels').headers.Authorization, /session-token/);
});

test('an empty but inconsistent final channel page cannot enter an endless retry loop', () => {
    const app = application(); app.login();
    app.elements['categories-list'].children[1].onclick();
    app.next('/news/Channels').respond(200, { Items: [{ Id: 'first', Name: 'First' }], TotalRecordCount: 201 });
    app.elements['next-page'].onclick();
    app.next('startIndex=100').respond(200, { Items: [{ Id: 'second', Name: 'Second' }], TotalRecordCount: 201 });
    app.elements['next-page'].onclick();
    app.next('startIndex=200').respond(200, { Items: [], TotalRecordCount: 201 });
    assert.equal(app.requests.length, 0);
    assert.match(app.elements['page-summary'].textContent, /No channels returned on this page/);
    assert.equal(app.elements['previous-page'].disabled, false);
});

test('stale aborted channel responses cannot erase the currently active category view', () => {
    const app = application(); app.login();
    app.elements['categories-list'].children[1].onclick();
    const obsolete = app.next('/news/Channels');
    app.elements['category-back'].onclick();
    const current = app.next('/LiveTvCategories');
    assert.equal(obsolete.aborted, true);
    current.respond(200, [{ id: 'news', name: 'News', channelCount: 201 }]);
    obsolete.respond(401, {});
    assert.equal(app.elements['categories-view'].hidden, false);
    assert.equal(app.storage.has(app.key), true);
});

test('Back-cache restoration revalidates authentication before trusting the stored session', () => {
    const app = application(); app.login();
    app.windowEvents.pageshow({ persisted: true });
    app.next('/Compatibility').respond(401, {});
    assert.equal(app.elements['login-view'].hidden, false);
    assert.equal(app.storage.has(app.key), false);
});
