import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './web/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 2,
    timeout: 30_000,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: { baseURL: 'http://127.0.0.1:18897', trace: 'retain-on-failure' },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
    webServer: {
        command: 'node web/e2e/fixture-server.mjs',
        url: 'http://127.0.0.1:18897/health',
        reuseExistingServer: false,
        timeout: 15_000
    }
});
