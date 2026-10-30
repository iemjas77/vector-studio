import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const bundled = '/opt/pw-browsers/chromium';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: existsSync(bundled) ? { executablePath: bundled, args: ['--no-sandbox'] } : {},
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
