import { test, expect } from '@playwright/test';

async function signIn(page, prefix = '') {
    await page.goto(prefix + '/LiveTvCategories/ui/');
    await page.locator('#username').fill('viewer');
    await page.locator('#password').fill('fixture-password');
    await page.locator('#sign-in').click();
    await expect(page.locator('#categories-view')).toBeVisible();
}

test('normal-user login, bounded paging and category Back restoration', async ({ page }) => {
    await signIn(page);
    await page.locator('[data-category-id="category-news"]').click();
    await expect(page.locator('#channels-list [data-channel-id]')).toHaveCount(100);
    await page.locator('#next-page').click();
    await expect(page.locator('#channels-list')).toContainText('News channel 101');
    await expect(page.locator('#channels-list')).not.toContainText('News channel 1Fixture');
    await page.locator('#category-back').click();
    await expect(page.locator('#categories-view')).toBeVisible();
    await expect(page.locator('[data-category-id="category-news"]')).toBeFocused();
});

test('opening a channel leaves playback to Jellyfin and restores page/focus on browser Back', async ({ page }) => {
    await signIn(page);
    await page.locator('[data-category-id="category-news"]').click();
    await page.locator('#next-page').click();
    const link = page.locator('#channels-list [data-channel-id]').first();
    await expect(link).toContainText('News channel 101');
    const channelId = await link.getAttribute('data-channel-id');
    await link.click();
    await expect(page).toHaveURL(/\/web\/index\.html.*details/);
    await page.goBack();
    await expect(page.locator('#channels-view')).toBeVisible();
    await expect(page.locator('#channels-list')).toContainText('News channel 101');
    await expect(page.locator(`[data-channel-id="${channelId}"]`)).toBeFocused();
});

test('configured Jellyfin BaseUrl is retained for API calls and channel handoff', async ({ page }) => {
    await signIn(page, '/jellyfin');
    await page.locator('[data-category-id="category-news"]').click();
    await page.locator('#channels-list [data-channel-id]').first().click();
    await expect(page).toHaveURL(/\/jellyfin\/web\/index\.html.*details/);
});

test('untrusted Unicode category and channel names render only as text', async ({ page }) => {
    await signIn(page);
    const category = page.locator('[data-category-id="category-unicode"]');
    await expect(category).toContainText('Café & World <img src=x onerror=alert(1)>');
    await expect(category.locator('img')).toHaveCount(0);
    await category.click();
    await expect(page.locator('#channels-list')).toContainText('<script>alert(1)</script>');
    await expect(page.locator('#channels-list script')).toHaveCount(0);
    await expect(page.locator('#categories-list .material-icons')).toHaveCount(0);
});

test('sign-out clears the owned token and shows the normal login screen', async ({ page }) => {
    await signIn(page);
    await page.locator('#sign-out').click();
    await expect(page.locator('#login-form')).toBeVisible();
    const storage = await page.evaluate(() => Object.values(sessionStorage));
    expect(storage.join('')).not.toContain('fixture-user-token');
    await page.reload();
    await expect(page.locator('#login-form')).toBeVisible();
});

test('expired sessions return to login without displaying protected channel data', async ({ page }) => {
    await signIn(page);
    await page.route('**/LiveTvCategories/*/Channels?**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await page.locator('[data-category-id="category-news"]').click();
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#channels-list [data-channel-id]')).toHaveCount(0);
});

test('permission failures retain a visible normal-Jellyfin fallback', async ({ page }) => {
    await page.route('**/LiveTvCategories', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
    await signIn(page);
    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('a[href*="/web/index.html"]').first()).toBeVisible();
});
