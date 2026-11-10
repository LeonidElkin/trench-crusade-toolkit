import { defineConfig, devices } from '@playwright/test'
const external = process.env.E2E_BASE_URL
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 45000,
  expect: { timeout: 8000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external || 'http://127.0.0.1:4173/trench-crusade-toolkit/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: external
    ? undefined
    : {
        command: 'npm run preview -- --base /trench-crusade-toolkit/ --port 4173',
        url: 'http://127.0.0.1:4173/trench-crusade-toolkit/',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
})
