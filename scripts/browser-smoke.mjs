import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.env.LTVC_TEST_URL;
assert.ok(baseUrl && process.env.LTVC_TEST_USERNAME && process.env.LTVC_TEST_PASSWORD, 'Run through smoke-server.ps1 with a local fixture account');
const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    await page.goto(baseUrl + '/LiveTvCategories/ui/');
    await page.locator('#username').fill(process.env.LTVC_TEST_USERNAME);
    await page.locator('#password').fill(process.env.LTVC_TEST_PASSWORD);
    await page.locator('#sign-in').click();
    await page.locator('#categories-view').waitFor({ state: 'visible' });
    try {
        await page.getByRole('button', { name: /^News,/ }).click({ timeout: 10_000 });
    } catch (error) {
        console.error('Category browser status:', await page.locator('#error').textContent());
        throw error;
    }
    await page.locator('#next-page').click();
    const firstChannel = page.locator('#channels-list [data-channel-id]').first();
    await firstChannel.waitFor({ state: 'visible' });
    const channelId = await firstChannel.getAttribute('data-channel-id');
    const pageText = await page.locator('#page-summary').textContent();
    await firstChannel.click();
    await page.waitForURL(/\/web\/index\.html.*details/);
    await page.goBack();
    await page.locator('#channels-view').waitFor({ state: 'visible' });
    await expect(page.locator('#page-summary')).toHaveText(pageText);
    const restoredChannel = page.locator(`[data-channel-id="${channelId}"]`);
    await restoredChannel.waitFor({ state: 'visible' });
    await page.waitForFunction(id => document.activeElement?.getAttribute('data-channel-id') === id, channelId);
    await page.locator('#category-back').click();
    await page.locator('#categories-view').waitFor({ state: 'visible' });
    await page.locator('#sign-out').click();
    await page.locator('#login-form').waitFor({ state: 'visible' });
    console.log('PASS: Independent browser login, category paging, stock channel handoff, Back restoration, focus and sign-out');
    if (process.env.LTVC_TEST_BUNDLED_WEB?.toLowerCase() === 'true') {
        await page.goto(baseUrl + '/web/index.html');
        await page.locator('#loginPage').waitFor({ state: 'visible' });
        if (!await page.locator('#txtManualName').isVisible()) await page.locator('.btnManual').click();
        await page.locator('#txtManualName').fill(process.env.LTVC_TEST_USERNAME);
        await page.locator('#txtManualPassword').fill(process.env.LTVC_TEST_PASSWORD);
        await page.locator('.manualLoginForm button[type="submit"]').click();
        await page.waitForURL(/home/);
        await page.locator('a[href*="livetv"]:visible').first().click();
        try {
            await page.getByRole('button', { name: /^News,/ }).click();
        } catch (error) {
            console.error('Integrated view:', page.url(), (await page.locator('body').innerText()).slice(0, 1200));
            throw error;
        }
        const card = page.locator('[data-type="TvChannel"][data-id]').first();
        await card.waitFor({ state: 'visible' });
        const integratedChannelId = await card.getAttribute('data-id');
        const cardLink = card.locator('a').first();
        if (await cardLink.count()) await cardLink.click();
        else await card.click();
        await page.waitForURL(/details/);
        await page.goBack();
        await page.locator(`[data-id="${integratedChannelId}"]`).first().waitFor({ state: 'visible' });
        await expect(page.getByRole('button', { name: /^News,/ })).toHaveCount(0);
        console.log('PASS: Integrated Programmes categories and channel Back restoration');
    }
} finally { await browser.close(); }
