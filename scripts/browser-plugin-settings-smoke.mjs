import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { waitForManualLogin } from './browser-login.mjs';

const baseUrl = process.env.LTVC_TEST_URL;
const action = process.env.LTVC_TEST_SETTINGS_ACTION;
assert.ok(baseUrl && process.env.LTVC_TEST_ADMIN_USERNAME && process.env.LTVC_TEST_ADMIN_PASSWORD,
    'Run through smoke-server.ps1 with an isolated administrator fixture');
assert.ok(['enable', 'verify-enabled', 'disable'].includes(action), 'Expected a plugin settings smoke action');
const pluginId = 'a4b2fdc8-cb2a-463b-812a-16e9ea88e12a';
const initiallyEnabled = action !== 'enable';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
// Routing disables the HTTP cache, modelling the instructed hard refresh when
// switching between stock and bundled clients with some stable shell filenames.
await context.route('**/*', route => route.continue());
await context.addInitScript(() => { localStorage.setItem('layout', 'modern'); });
const page = await context.newPage();
try {
    const response = await page.goto(baseUrl + '/web/index.html');
    assert.equal(Boolean(response.headers()['x-live-tv-categories-web']), initiallyEnabled,
        'The actual Web response reflects the current version override');
    await page.locator('#loginPage').waitFor({ state: 'visible' });
    await waitForManualLogin(page);
    await page.locator('#txtManualName').fill(process.env.LTVC_TEST_ADMIN_USERNAME);
    await page.locator('#txtManualPassword').fill(process.env.LTVC_TEST_ADMIN_PASSWORD);
    await page.locator('.manualLoginForm button[type="submit"]').click();
    await page.waitForURL(/home/);
    await page.getByText('My Media', { exact: true }).waitFor({ state: 'visible' });
    await page.evaluate(() => { window.location.hash = '/configurationpage?name=LiveTvCategoriesConfig'; });
    await page.locator('#LiveTvCategoriesConfigPage').waitFor({ state: 'visible' });
    const checkbox = page.locator('#AllowUntestedServerVersions');
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).toBeChecked({ checked: initiallyEnabled });
    const warning = page.locator('#LiveTvCategoriesCompatibilityWarning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/untested/i);
    await expect(warning).toContainText(/entire|whole/i);
    await expect(warning).toContainText(/playback|sign.in|dashboard/i);
    if (action !== 'verify-enabled') {
        const enabled = action === 'enable';
        // Jellyfin decorates native inputs with a visible checkbox label. Click
        // that user-facing label rather than its covered input element.
        await page.getByText('Allow bundled interface on untested Jellyfin versions', { exact: true }).click();
        await expect(checkbox).toBeChecked({ checked: enabled });
        const saved = page.waitForResponse(result =>
            new URL(result.url()).pathname.toLowerCase().endsWith(`/plugins/${pluginId}/configuration`)
            && result.request().method() === 'POST');
        await page.locator('#LiveTvCategoriesConfigSave').click();
        assert.ok((await saved).ok(), 'Jellyfin accepts the administrator configuration save');
        await expect(page.locator('#LiveTvCategoriesConfigStatus')).toContainText(/saved/i);
        const reloaded = await page.reload();
        assert.equal(Boolean(reloaded.headers()['x-live-tv-categories-web']), enabled,
            'Saving the toggle changes which Web interface is served without a restart');
        await page.locator('#LiveTvCategoriesConfigPage').waitFor({ state: 'visible' });
        await expect(checkbox).toBeEnabled();
        await expect(checkbox).toBeChecked({ checked: enabled });
        await expect(warning).toBeVisible();
        if (enabled) {
            await page.screenshot({ path: 'build/browser-plugin-settings-enabled.png', fullPage: true });
            await page.evaluate(() => { window.location.hash = '/livetv?collectionType=livetv&tab=0'; });
            await page.getByRole('button', { name: /^News,/ }).waitFor({ state: 'visible' });
        }
    }
    console.log(`PASS: Real administrator settings ${action}: visible warning, persisted choice and live Web selection`);
} catch (error) {
    console.error('Plugin settings view:', page.url(), (await page.locator('body').innerText()).slice(0, 1200));
    await page.screenshot({ path: `build/browser-plugin-settings-${action}-failure.png` }).catch(() => {});
    throw error;
} finally { await browser.close(); }
