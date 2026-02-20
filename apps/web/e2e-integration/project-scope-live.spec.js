const { test, expect } = require("@playwright/test");

function uniqueProjectName(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function signIn(page, username = "admin", password = "admin") {
  const consoleLogs = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));
  const networkRequests = [];
  page.on("request", (req) => networkRequests.push(`${req.method()} ${req.url()}`));

  await page.goto("/login");
  await expect(page.getByTestId("login-username")).toBeVisible();
  await page.getByTestId("login-username").fill(username);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForTimeout(5_000);

  const currentUrl = page.url();
  console.log(`[signIn] URL after click: ${currentUrl}`);
  console.log(`[signIn] Console:\n${consoleLogs.join("\n")}`);
  console.log(`[signIn] Network (non-_next):\n${networkRequests.filter((r) => !r.includes("_next")).join("\n")}`);

  await expect(page).toHaveURL(/\/control-tower\/dashboard$/);
}

async function createProject(page, name) {
  await page.goto("/projects");
  await expect(page.getByPlaceholder("Project name")).toBeVisible();
  await page.getByPlaceholder("Project name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("cell", { name })).toBeVisible();
}

async function switchProjectFromSidebar(page, projectName, { mobile = false } = {}) {
  if (mobile) {
    await page.getByTestId("mobile-projects-open").click();
    const sheet = page.getByTestId("mobile-projects-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: new RegExp(projectName) }).click();
    await expect(sheet).toBeHidden();
    await page.getByTestId("mobile-projects-open").click();
    await expect(sheet.getByText(`Выбор: ${projectName}`)).toBeVisible();
    return;
  }

  const sidebar = page.getByTestId("project-sidebar-panel");
  await sidebar.getByRole("button", { name: new RegExp(projectName) }).click();
  await expect(sidebar.getByText(`Выбор: ${projectName}`)).toBeVisible();
}

test("real stack: new session auto-resolves active project and jobs page works without active_project_required", async ({ page }) => {
  const projectA = uniqueProjectName("e2e-alpha");
  const projectB = uniqueProjectName("e2e-beta");

  await signIn(page);
  await createProject(page, projectA);
  await createProject(page, projectB);

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page);
  await page.goto("/jobs");
  await expect(page.getByRole("button", { name: "Run Chatwoot Sync" })).toBeVisible();
  await expect(page.getByText("Сначала выберите активный проект")).toHaveCount(0);
  await expect(page.getByText(/active_project_required/i)).toHaveCount(0);
});

test.describe("mobile real stack", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("project switch via sheet keeps jobs scope valid", async ({ page }) => {
    const projectName = uniqueProjectName("e2e-mobile");

    await signIn(page);
    await createProject(page, projectName);
    await page.goto("/jobs");
    await expect(page.getByRole("button", { name: "Run Chatwoot Sync" })).toBeVisible();

    await switchProjectFromSidebar(page, projectName, { mobile: true });

    await page.getByRole("button", { name: "Refresh status" }).click();
    await expect(page.getByText(/active_project_required/i)).toHaveCount(0);
    await expect(page.getByText("Сначала выберите активный проект")).toHaveCount(0);
  });
});
