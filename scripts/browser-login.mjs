import { errors, expect } from '@playwright/test';

// The native login page may choose its manual form asynchronously. Its page
// container being visible does not mean that choice has finished rendering.
export async function waitForManualLogin(page, { timeout = 30_000 } = {}) {
    const username = page.locator('#txtManualName');
    const manualButton = page.locator('.btnManual');
    await expect.poll(async () => {
        if (await username.isVisible()) return true;
        if (await manualButton.isVisible()) {
            try {
                await manualButton.click({ timeout: Math.min(1000, timeout) });
            } catch (error) {
                // The button can disappear as Jellyfin automatically reveals
                // the form. Only that actionability timeout is retried; other
                // browser errors and all subsequent test assertions propagate.
                if (!(error instanceof errors.TimeoutError)) throw error;
            }
        }
        return username.isVisible();
    }, {
        timeout,
        intervals: [50, 100, 250],
        message: 'Native Jellyfin manual sign-in form becomes visible'
    }).toBe(true);
}
