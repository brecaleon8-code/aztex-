import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Use a preinstalled Chromium when provided (e.g. CI images / sandboxes).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } },
    // The docked-workspace acceptance tests again in the light theme.
    { name: 'chromium-light', grep: /Docked workspace/, metadata: { theme: 'light' }, use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 }, colorScheme: 'light' } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
