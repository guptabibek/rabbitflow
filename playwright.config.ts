import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL } from './tests/e2e/support/env'

const browserChannel = process.env.E2E_BROWSER_CHANNEL
const fullMatrix = process.env.E2E_FULL_MATRIX === 'true'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The development server compiles routes on demand. Letting Playwright use
  // every local CPU can overload that single server and turn project-card
  // clicks into unrelated navigation timeouts. Two workers matches CI and
  // keeps local results reproducible.
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    /*
      Run against a browser that is already on the machine.

      Playwright's own build is a ~280 MB download from its CDN, which on a slow
      or filtered connection stalls part-way and leaves a half-extracted
      directory that still reports itself as installed. Setting
      E2E_BROWSER_CHANNEL=chrome (or msedge) runs the suite against the
      installed browser instead, which is enough for these tests.

      It lives on the top-level `use` so the `setup` project — which has no
      `use` block of its own and generates the shared auth states — picks it up
      too. CI leaves it unset and uses the pinned Playwright build, so the
      version the pipeline tests against stays reproducible.
    */
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup[\\/].*\.setup\.ts/,
      use: browserChannel ? { channel: browserChannel } : {},
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
      dependencies: ['setup'],
    },
    ...(fullMatrix ? [
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
        dependencies: ['setup'],
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
        dependencies: ['setup'],
      },
      {
        name: 'mobile-chromium',
        testMatch: /(accessibility|product-planning)\.spec\.ts/,
        use: { ...devices['Pixel 7'] },
        dependencies: ['setup'],
      },
      {
        name: 'mobile-webkit',
        testMatch: /(accessibility|product-planning)\.spec\.ts/,
        use: { ...devices['iPhone 15'] },
        dependencies: ['setup'],
      },
    ] : []),
  ],
  webServer:
    process.env.E2E_SKIP_WEBSERVER === 'true'
      ? undefined
      : {
          command: 'npm run dev',
          url: E2E_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: 'pipe',
          stderr: 'pipe',
          // Registration is disabled by default in production, while the auth
          // E2E project deliberately covers the opt-in registration journey.
          env: {
            ALLOW_SELF_REGISTRATION: process.env.ALLOW_SELF_REGISTRATION ?? 'true',
            E2E_DISABLE_RATE_LIMITS: 'true',
          },
        },
})
