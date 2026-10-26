import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { waitForManualLogin } from './browser-login.mjs';

const baseUrl = process.env.LTVC_TEST_URL;
assert.ok(baseUrl && process.env.LTVC_TEST_USERNAME && process.env.LTVC_TEST_PASSWORD, 'Run through smoke-server.ps1 with a local fixture account');
const browser = await chromium.launch();

async function checkIntegratedLayout(layout) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addInitScript(value => {
        localStorage.setItem('layout', value);
        localStorage.setItem('libraryPageSize', '100');
    }, layout);
    const page = await context.newPage();
    try {
        await page.goto(baseUrl + '/web/index.html');
        await page.locator('#loginPage').waitFor({ state: 'visible' });
        await waitForManualLogin(page);
        await page.locator('#txtManualName').fill(process.env.LTVC_TEST_USERNAME);
        await page.locator('#txtManualPassword').fill(process.env.LTVC_TEST_PASSWORD);
        await page.locator('.manualLoginForm button[type="submit"]').click();
        await page.waitForURL(/home/);
        await page.getByText('My Media', { exact: true }).waitFor({ state: 'visible' });
        // 12.3 keys remembered Live TV tabs by collectionType. Preserve that
        // stock route contract and deliberately select Programmes, not Guide.
        // TV home tiles are not anchors: use the same public in-app route in
        // both layouts, after login and home initialization have completed.
        await page.evaluate(() => { window.location.hash = '/livetv?collectionType=livetv&tab=0'; });
        const category = page.getByRole('button', { name: /^News,/ });
        await category.waitFor({ state: 'visible' });
        assert.ok(await category.locator('svg').count(), `${layout} category icons are SVG`);
        await expect(category.locator('.material-icons')).toHaveCount(0);
        await category.click();
        const channelContainer = layout === 'tv' ? page.locator('.liveTvCategoryChannelItems') : page.locator('#liveTvPage');
        const cards = channelContainer.locator('[data-type="TvChannel"][data-id]:visible');
        await cards.first().waitFor({ state: 'visible' });
        const initialId = await cards.first().getAttribute('data-id');
        const next = layout === 'tv' ? page.locator('.btnNextPage:visible').first() : page.locator('button[title="Next"]:visible').first();
        await expect(next).toBeEnabled();
        assert.ok(await next.locator('svg').count(), `${layout} paging controls are SVG`);
        await next.focus();
        await next.press('Enter');
        await expect(cards.first()).not.toHaveAttribute('data-id', initialId);
        const card = cards.first();
        const channelId = await card.getAttribute('data-id');
        const previous = layout === 'tv' ? page.locator('.btnPreviousPage:visible').first() : page.locator('button[title="Previous"]:visible').first();
        await expect(previous).toBeEnabled();
        const cardLink = layout === 'tv' ? card : card.locator('a[href*="details"]:visible').first();
        // The image has a native Play overlay. Keyboard/remote Enter activates
        // its details link without accidentally starting the fixture stream.
        // TV cards are native buttons: do not activate their nested title link,
        // which can also trigger the containing button's keyboard action.
        if (layout === 'tv') await expect(cardLink).toHaveAttribute('data-action', 'link');
        assert.equal(await cardLink.count(), 1, `${layout} has one native details action`);
        const categoryUrl = page.url();
        await cardLink.focus();
        await expect(cardLink).toBeFocused();
        console.log(`CHECK: ${layout} details action`, await cardLink.evaluate(node => ({ tag: node.tagName, action: node.getAttribute('data-action'), href: node.getAttribute('href') })), categoryUrl);
        await cardLink.press('Enter');
        await page.waitForURL(/details/);
        if (layout === 'tv') {
            // Legacy navigation updates the hash before asynchronous view
            // loading finishes. Back must start from the opened details view,
            // not race that still-pending native navigation.
            await page.locator('#itemDetailPage .mainDetailButtons .btnPlay:visible').waitFor({ state: 'visible' });
            await expect(page.locator('#liveTvSuggestedPage')).toBeHidden();
        }
        console.log(`CHECK: ${layout} details opened`, page.url());
        await page.goBack();
        await expect(page).toHaveURL(categoryUrl);
        if (layout === 'tv') {
            await page.locator('#liveTvSuggestedPage').waitFor({ state: 'visible' });
            await expect(page.locator('#itemDetailPage')).toBeHidden();
        }
        console.log(`CHECK: ${layout} returning to category`, page.url());
        const restoredCard = channelContainer.locator(`[data-type="TvChannel"][data-id="${channelId}"]:visible`).first();
        await restoredCard.waitFor({ state: 'visible' });
        await expect(previous).toBeEnabled();
        await expect(category).toHaveCount(0);
        await page.waitForFunction(id => document.activeElement?.closest('[data-id]')?.getAttribute('data-id') === id, channelId);
        const back = layout === 'tv' ? page.locator('.btnCategoryBack:visible') : page.locator('#liveTvPage').getByRole('button', { name: 'Back', exact: true });
        await back.waitFor({ state: 'visible' });
        assert.ok(await back.locator('svg').count(), `${layout} category Back control is SVG`);
        await expect(back.locator('.material-icons')).toHaveCount(0);
        await back.focus();
        await back.press('Enter');
        await category.waitFor({ state: 'visible' });
        await expect(category).toBeFocused();
        console.log(`PASS: Integrated ${layout} layout: SVG icons, category paging, channel Back, category Back and focus restoration`);
    } catch (error) {
        console.error(`Integrated ${layout} view:`, page.url(), (await page.locator('body').innerText()).slice(0, 1200));
        console.error('Focus and view state:', await page.evaluate(() => ({
            active: document.activeElement?.outerHTML.slice(0, 400),
            views: Array.from(document.querySelectorAll('.page')).map(view => ({ id: view.id, classes: view.className, hidden: view.getAttribute('aria-hidden') })),
            categoryBack: Array.from(document.querySelectorAll('.btnCategoryBack')).map(node => ({ html: node.outerHTML, rect: node.getBoundingClientRect().toJSON() }))
        })));
        await page.screenshot({ path: `build/browser-smoke-${layout}-failure.png` }).catch(() => {});
        throw error;
    } finally { await context.close(); }
}

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
        await checkIntegratedLayout('tv');
        await checkIntegratedLayout('modern');
    }
} finally { await browser.close(); }
