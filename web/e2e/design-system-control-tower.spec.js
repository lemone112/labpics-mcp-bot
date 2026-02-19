const { test, expect } = require("@playwright/test");

const PROJECT = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Проект Тест",
  created_at: "2026-02-17T10:00:00.000Z",
  account_scope_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
};

function jsonOk(route, payload) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function emptyPortfolioPayload() {
  return {
    dashboard: { totals: {}, charts: {} },
    agreements: [],
    risks: [],
    finances: { totals: {}, charts: {}, by_project: [] },
    offers: { upsell: [], recent_offers: [], discount_policy: [] },
    loops: { contacts_with_email: 0, unique_emails: 0 },
  };
}

async function installMocks(page, { hasProjects = true } = {}) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const apiPath = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && apiPath === "/auth/me") {
      return jsonOk(route, {
        authenticated: true,
        username: "demo",
        active_project_id: hasProjects ? PROJECT.id : null,
        account_scope_id: PROJECT.account_scope_id,
        csrf_cookie_name: "csrf_token",
        csrf_token: "mock-csrf",
      });
    }

    if (method === "GET" && apiPath === "/projects") {
      return jsonOk(route, {
        projects: hasProjects ? [PROJECT] : [],
        active_project_id: hasProjects ? PROJECT.id : null,
        account_scope_id: PROJECT.account_scope_id,
      });
    }

    if (method === "POST" && apiPath.match(/^\/projects\/[^/]+\/select$/)) {
      return jsonOk(route, { active_project_id: PROJECT.id, project: PROJECT });
    }

    if (method === "GET" && apiPath === "/portfolio/overview") {
      return jsonOk(route, emptyPortfolioPayload());
    }

    if (method === "GET" && apiPath === "/portfolio/messages") {
      return jsonOk(route, { project: PROJECT, persons: [], messages: [] });
    }

    if (method === "GET" && apiPath === "/jobs/status") {
      return jsonOk(route, {
        rag_counts: { pending: 0, processing: 0, ready: 0, failed: 0 },
        entities: {},
        storage: { database_bytes: 0, usage_percent: 0 },
        jobs: [],
      });
    }

    return jsonOk(route, {});
  });
}

const SECTIONS = ["dashboard", "messages", "agreements", "risks", "finance", "offers"];

for (const section of SECTIONS) {
  test(`/control-tower/${section}: hero panel, primary CTA, trust bar present`, async ({ page }) => {
    await installMocks(page, { hasProjects: true });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`/control-tower/${section}`);

    const hero = page.getByTestId("ct-hero");
    await expect(hero).toBeVisible();

    const cta = page.getByTestId("primary-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveCount(1);

    const trustBar = page.getByTestId("trust-bar");
    await expect(trustBar).toBeVisible();
  });
}

for (const section of SECTIONS) {
  test(`/control-tower/${section}: empty wizard when no projects`, async ({ page }) => {
    await installMocks(page, { hasProjects: false });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`/control-tower/${section}`);

    const wizard = page.getByTestId("empty-wizard");
    await expect(wizard).toBeVisible();

    await expect(page.getByTestId("ct-hero")).toHaveCount(0);
  });
}
