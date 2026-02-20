import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const currentFile = fileURLToPath(import.meta.url);
const webDir = path.resolve(path.dirname(currentFile), "..");
const repoRoot = path.resolve(webDir, "../..");
const serverDir = path.join(repoRoot, "apps", "api");

const composeProjectName = process.env.E2E_COMPOSE_PROJECT_NAME || "labpics_e2e";
const dbPort = process.env.E2E_DB_PORT || "55432";
const dbName = process.env.E2E_DB_NAME || "labpics_e2e";
const dbUser = process.env.E2E_DB_USER || "app";
const dbPassword = process.env.E2E_DB_PASSWORD || "app";

const webPort = process.env.PLAYWRIGHT_WEB_PORT || "3101";
const apiPort = process.env.PLAYWRIGHT_API_PORT || "18080";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${webPort}`;
const apiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL || `http://localhost:${apiPort}`;
const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL || `postgresql://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}`;
const authCredentials = process.env.PLAYWRIGHT_AUTH_CREDENTIALS || "admin:admin";
const keepDb = String(process.env.E2E_KEEP_DB || "").trim() === "1";

const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: composeProjectName,
  DB_PORT: dbPort,
  POSTGRES_DB: dbName,
  POSTGRES_USER: dbUser,
  POSTGRES_PASSWORD: dbPassword,
  AUTH_CREDENTIALS: authCredentials,
};

function runCommand(command, args, { cwd, env = {}, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });

    child.on("error", (error) => {
      if (allowFailure) {
        resolve(127);
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0 || allowFailure) {
        resolve(code || 0);
        return;
      }
      reject(new Error(`Command failed (${command} ${args.join(" ")}), exit code ${code}`));
    });
  });
}

async function commandAvailable(command, args = ["--version"]) {
  const code = await runCommand(command, args, {
    cwd: webDir,
    env: { ...process.env },
    allowFailure: true,
  });
  return code === 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDbReady(maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const code = await runCommand(
      "docker",
      ["compose", "exec", "-T", "db", "pg_isready", "-U", dbUser, "-d", dbName],
      { cwd: repoRoot, env: composeEnv, allowFailure: true }
    );
    if (code === 0) return;
    await delay(1000);
  }
  throw new Error("Postgres did not become ready in time");
}

async function cleanupDbStack() {
  await runCommand("docker", ["compose", "down", "-v"], {
    cwd: repoRoot,
    env: composeEnv,
    allowFailure: true,
  });
}

async function main() {
  let dockerUsed = false;
  const strictDocker = String(process.env.E2E_REQUIRE_DOCKER || "").trim() === "1";
  const hasDocker = await commandAvailable("docker");
  if (!hasDocker) {
    const message =
      "Docker is not available in current environment. " +
      "Set E2E_REQUIRE_DOCKER=1 to fail hard, or install Docker for live integration mode.";
    if (strictDocker) {
      throw new Error(message);
    }
    console.warn(`[e2e:integration] ${message}`);
    console.warn("[e2e:integration] Falling back to mocked Playwright suite (npm run test:e2e).");
    await runCommand("npx", ["playwright", "test"], { cwd: webDir, env: { ...process.env } });
    return;
  }

  dockerUsed = true;
  await cleanupDbStack();
  await runCommand("docker", ["compose", "up", "-d", "db"], { cwd: repoRoot, env: composeEnv });
  await waitForDbReady();

  await runCommand("node", ["scripts/reset-db-for-e2e.mjs"], {
    cwd: serverDir,
    env: { DATABASE_URL: databaseUrl },
  });

  await runCommand("npm", ["run", "migrate"], {
    cwd: serverDir,
    env: { DATABASE_URL: databaseUrl },
  });

  await runCommand("npx", ["playwright", "install", "chromium"], {
    cwd: webDir,
    env: { ...process.env },
  });

  await runCommand("npx", ["playwright", "test", "-c", "playwright.integration.config.js"], {
    cwd: webDir,
    env: {
      ...process.env,
      PLAYWRIGHT_WEB_PORT: webPort,
      PLAYWRIGHT_API_PORT: apiPort,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_API_BASE_URL: apiBaseURL,
      PLAYWRIGHT_DATABASE_URL: databaseUrl,
      PLAYWRIGHT_AUTH_CREDENTIALS: authCredentials,
    },
  });
  if (!keepDb && dockerUsed) {
    await cleanupDbStack();
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  if (!keepDb) {
    await cleanupDbStack();
  }
});
