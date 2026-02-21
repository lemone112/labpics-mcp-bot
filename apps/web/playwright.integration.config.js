const { defineConfig } = require("@playwright/test");

const webPort = process.env.PLAYWRIGHT_WEB_PORT || "3101";
const apiPort = process.env.PLAYWRIGHT_API_PORT || "18080";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${webPort}`;
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL || `http://localhost:${apiPort}`;
const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL || "";
const authCredentials = process.env.PLAYWRIGHT_AUTH_CREDENTIALS || "admin:admin";
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results";

function resolveReporter(defaultReporter = "list") {
  if (process.env.PLAYWRIGHT_REPORTER !== "ci") {
    return defaultReporter;
  }

  return [
    ["list"],
    [
      "junit",
      {
        outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE || "test-results/junit.xml",
      },
    ],
  ];
}

module.exports = defineConfig({
  testDir: "./e2e-integration",
  fullyParallel: false,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: resolveReporter("list"),
  outputDir,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run start",
      cwd: "../api",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        HOST: "0.0.0.0",
        PORT: apiPort,
        AUTH_CREDENTIALS: authCredentials,
        CORS_ORIGIN: baseURL,
        SESSION_COOKIE_NAME: "sid",
        CSRF_COOKIE_NAME: "csrf_token",
        ATTIO_MOCK_MODE: "1",
        LINEAR_MOCK_MODE: "1",
        CHATWOOT_API_TOKEN: "e2e-token",
        CHATWOOT_BASE_URL: "https://example.invalid",
        CHATWOOT_ACCOUNT_ID: "1",
        OPENAI_API_KEY: "e2e-token",
      },
      url: `${apiBaseUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- -p ${webPort}`,
      cwd: ".",
      env: {
        ...process.env,
        API_UPSTREAM_URL: `http://localhost:${apiPort}`,
        NEXT_PUBLIC_CSRF_COOKIE_NAME: "csrf_token",
      },
      url: `${baseURL}/login`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
