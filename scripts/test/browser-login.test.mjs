import assert from 'node:assert/strict';
import test from 'node:test';
import { errors } from '@playwright/test';
import { waitForManualLogin } from '../browser-login.mjs';

function fixture({ visible = false, manual = false, click = () => {} } = {}) {
    const state = { visible, manual, clicks: 0, visibilityChecks: 0, clickTimeout: null };
    const page = {
        locator(selector) {
            if (selector === '#txtManualName') return {
                async isVisible() { state.visibilityChecks++; return state.visible; }
            };
            assert.equal(selector, '.btnManual');
            return {
                async isVisible() { return state.manual; },
                async click(options) { state.clicks++; state.clickTimeout = options.timeout; await click(state); }
            };
        }
    };
    return { page, state };
}

test('native login readiness accepts an already visible form without clicking manual login', async () => {
    const { page, state } = fixture({ visible: true, manual: true });
    await waitForManualLogin(page);
    assert.equal(state.clicks, 0);
});

test('native login readiness opens a stable manual-login choice', async () => {
    const { page, state } = fixture({ manual: true, click(state) { state.visible = true; } });
    await waitForManualLogin(page);
    assert.equal(state.clicks, 1);
    assert.equal(state.clickTimeout, 1000);
});

test('auto-shown manual form survives the choice button disappearing before its click', async () => {
    const { page, state } = fixture({ manual: true, click(state) {
        state.manual = false;
        state.visible = true;
        throw new errors.TimeoutError('The native page hid the button while showing its manual form');
    } });
    await waitForManualLogin(page);
    assert.equal(state.clicks, 1);
    assert.equal(state.clickTimeout, 1000);
});

test('native login readiness waits through the initial state with neither form nor button', async () => {
    const { page, state } = fixture();
    let checks = 0;
    const nativeLocator = page.locator.bind(page);
    page.locator = selector => selector === '#txtManualName' ? {
        async isVisible() { checks++; return checks >= 3; }
    } : nativeLocator(selector);
    await waitForManualLogin(page, { timeout: 1000 });
    assert.ok(checks >= 3);
    assert.equal(state.clicks, 0);
});

test('native login readiness never suppresses unexpected browser errors', async () => {
    const failure = new Error('Browser page closed unexpectedly');
    const { page, state } = fixture({ manual: true, click() { throw failure; } });
    await assert.rejects(waitForManualLogin(page), error => error === failure);
    assert.equal(state.clicks, 1);
});

test('native login readiness remains a bounded failure when no form is available', async () => {
    const { page, state } = fixture();
    await assert.rejects(waitForManualLogin(page, { timeout: 20 }), /Native Jellyfin manual sign-in form becomes visible/);
    assert.equal(state.clicks, 0);
});
