import { defineConfig } from '@playwright/test';
// Start the API and web app first (npm run dev from the project root), then run: npm run test:e2e --prefix client
export default defineConfig({ testDir: './e2e', timeout: 60_000, use: { baseURL: 'http://localhost:5173' } });
