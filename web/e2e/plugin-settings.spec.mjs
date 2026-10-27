import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const settingsHtml = await readFile(new URL('../../Jellyfin.Plugin.LiveTvCategories/Configuration/configPage.html', import.meta.url), 'utf8');
const pluginId = 'a4b2fdc8-cb2a-463b-812a-16e9ea88e12a';
const fixturePath = '/jellyfin/plugin-settings-fixture';

async function openSettings(page, options = {}) {
    await page.addInitScript(({ fixtureOptions, expectedId }) => {
        window.fixtureOptions = fixtureOptions;
        window.savedConfigurations = [];
        window.configurationIds = [];
        const storageKey = 'plugin-settings-fixture';
        if (!localStorage.getItem(storageKey)) {
            localStorage.setItem(storageKey, JSON.stringify({ RetainedSetting: { enabled: true }, ...fixtureOptions.config }));
        }
        window.ApiClient = {
            getPluginConfiguration(id) {
                window.configurationIds.push(id);
                if (id !== expectedId || window.fixtureOptions.failLoad) return Promise.reject(new Error('fixture load failure'));
                return Promise.resolve(JSON.parse(localStorage.getItem(storageKey)));
            },
            updatePluginConfiguration(id, config) {
                if (id !== expectedId || window.fixtureOptions.failSave) return Promise.reject(new Error('fixture save failure'));
                window.savedConfigurations.push(config);
                localStorage.setItem(storageKey, JSON.stringify(config));
                return Promise.resolve({});
            }
        };
        window.Dashboard = {
            showLoadingMsg() {},
            hideLoadingMsg() {},
            processPluginConfigurationUpdateResult() {}
        };
    }, { fixtureOptions: options, expectedId: pluginId });
    await page.route('**/plugin-settings-fixture', route => route.fulfill({ contentType: 'text/html', body: settingsHtml }));
    await page.goto(fixturePath);
    await page.locator('#LiveTvCategoriesConfigPage').dispatchEvent('pageshow');
}

async function reloadSettings(page) {
    await page.reload();
    await page.locator('#LiveTvCategoriesConfigPage').dispatchEvent('pageshow');
}

test('plugin settings default off and explain the whole-interface risk before opting in', async ({ page }) => {
    await openSettings(page);
    const checkbox = page.getByRole('checkbox', { name: 'Allow bundled interface on untested Jellyfin versions' });
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toHaveAttribute('aria-describedby', /LiveTvCategoriesCompatibilityWarning/);
    const warning = page.locator('#LiveTvCategoriesCompatibilityWarning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('entire Web interface');
    await expect(warning).toContainText('security fixes');
    await expect(warning).toContainText('dashboard controls may stop working');
    await expect(warning).toContainText('does not make an untested version supported');
    await expect(warning).toContainText('server-wide setting');
    await expect(warning).toContainText('stays enabled across restarts and future Jellyfin upgrades');
    await expect(page.locator('#LiveTvCategoriesOverrideDescription')).toContainText('no server restart is needed');
    await expect(page.locator('#LiveTvCategoriesOverrideDescription')).toContainText('hard-refresh');
});

test('admin can enable and disable the override with saved state surviving reload and other settings preserved', async ({ page }) => {
    await openSettings(page, { config: { AllowUntestedServerVersions: false } });
    const checkbox = page.locator('#AllowUntestedServerVersions');
    await expect(checkbox).toBeEnabled();
    await checkbox.check();
    await page.evaluate(() => {
        const config = JSON.parse(localStorage.getItem('plugin-settings-fixture'));
        config.AddedAfterPageLoad = 'preserve the latest server configuration';
        localStorage.setItem('plugin-settings-fixture', JSON.stringify(config));
    });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#LiveTvCategoriesConfigStatus')).toContainText('override is enabled');
    await expect(page.locator('#LiveTvCategoriesConfigStatus')).toContainText('Hard-refresh all Jellyfin tabs');
    expect(await page.evaluate(() => window.savedConfigurations[0])).toEqual({
        AllowUntestedServerVersions: true,
        RetainedSetting: { enabled: true },
        AddedAfterPageLoad: 'preserve the latest server configuration'
    });
    expect(await page.evaluate(() => window.configurationIds.every(id => id === 'a4b2fdc8-cb2a-463b-812a-16e9ea88e12a'))).toBe(true);
    await reloadSettings(page);
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#LiveTvCategoriesConfigStatus')).toContainText('restriction is restored');
    await reloadSettings(page);
    await expect(checkbox).not.toBeChecked();
});

test('a settings load failure leaves saving disabled instead of overwriting an unknown saved value', async ({ page }) => {
    await openSettings(page, { config: { AllowUntestedServerVersions: true }, failLoad: true });
    await expect(page.locator('#LiveTvCategoriesConfigError')).toContainText('Could not load plugin settings');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.savedConfigurations)).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plugin-settings-fixture')).AllowUntestedServerVersions)).toBe(true);
});

test('a failed save shows an error and permits retry without claiming the setting was saved', async ({ page }) => {
    await openSettings(page, { config: { AllowUntestedServerVersions: false }, failSave: true });
    await page.locator('#AllowUntestedServerVersions').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#LiveTvCategoriesConfigError')).toContainText('Your change was not confirmed');
    await expect(page.locator('#LiveTvCategoriesConfigStatus')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plugin-settings-fixture')).AllowUntestedServerVersions)).toBe(false);
    await page.evaluate(() => { window.fixtureOptions.failSave = false; });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#LiveTvCategoriesConfigError')).toBeHidden();
    await expect(page.locator('#LiveTvCategoriesConfigStatus')).toContainText('override is enabled');
});
