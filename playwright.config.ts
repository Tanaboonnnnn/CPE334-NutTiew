import { defineConfig, devices } from '@playwright/test';
// The E2E-only localhost proxy setting lets feature tests give each run its
// own reserved documentation IP without disabling real Auth rate limits.
// Never enable this proxy trust in production without an actual trusted proxy.
export default defineConfig({testDir:'./e2e',timeout:45000,workers:1,use:{...devices['Desktop Chrome'],channel:'msedge',baseURL:'http://localhost:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},webServer:[{command:'npm run dev -w @nuttiew/api',url:'http://127.0.0.1:3001/api/v1/auth/me',reuseExistingServer:false,timeout:60000,env:{AUTH_TRUSTED_PROXIES:'127.0.0.1,::1,::ffff:127.0.0.1'}},{command:'npm run dev -w @nuttiew/web -- --host localhost',url:'http://localhost:5173',reuseExistingServer:false,timeout:60000}]});
