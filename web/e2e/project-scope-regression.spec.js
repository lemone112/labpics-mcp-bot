const { test, expect } = require("@playwright/test");

const PROJECT_ALPHA = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Проект Альфа",
  created_at: "2026-02-17T10:00:00.000Z",
  account_scope_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
};

const PROJECT_BETA = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Проект Бета",
  created_at: "2026-02-17T10:05:00.000Z",
  account_scope_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
};

function jsonOk(route, payload) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function installApiMocks(page) {
  const state = {
    activeProjectId: null,
    selectedProjectIds: [],
    projects: [PROJECT_BETA, PROJECT_ALPHA],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const apiPath = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && apiPath === "/auth/me") {
      return jsonOk(route, {
        authenticated: true,
        username: "demo",
        active_project_id: state.activeProjectId,
        account_scope_id: PROJECT_ALPHA.account_scope_id,
        csrf_cookie_name: "csrf_token",
      });
    }

    if (method === "GET" && apiPath === "/projects") {
      return jsonOk(route, {
        projects: state.projects,
        active_project_id: state.activeProjectId,
        account_scope_id: PROJECT_ALPHA.account_scope_id,
      });
    }

    const selectMatch = apiPath.match(/^\/projects\/([^/]+)\/select$/);
    if (method === "POST" && selectMatch) {
      const projectId = selectMatch[1];
      state.activeProjectId = projectId;
      state.selectedProjectIds.push(projectId);
      const project = state.projects.find((item) => item.id === projectId) || null;
      return jsonOk(route, {
        active_project_id: projectId,
        project,
      });
    }

    if (method === "GET" && apiPath === "/jobs/status") {
      return jsonOk(route, {
        rag_counts: { pending: 0, processing: 0, ready: 12, failed: 0 },
        entities: { contacts: 8, conversations: 5, messages: 31 },
        storage: { database_bytes: 1024 * 1024 * 256, usage_percent: 23 },
        jobs: [],
      });
    }

    if (method === "POST" && apiPath.startsWith("/jobs/")) {
      return jsonOk(route, { ok: true });
    }

    return jsonOk(route, {});
  });

  return state;
}

test("desktop: project sidebar click selects project and does not block jobs by active scope", async ({ page }) => {
  const state = await installApiMocks(page);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/jobs");

  await expect(page.getByRole("heading", { name: "Run jobs" })).toBeVisible();
  await expect(page.getByText("Сначала выберите активный проект")).toHaveCount(0);

  await page.getByTestId(`project-select-${PROJECT_BETA.id}`).click();

  await expect(page.getByText("Выбор: Проект Бета")).toBeVisible();
  await expect.poll(() => state.selectedProjectIds.length).toBe(1);
  await expect.poll(() => state.selectedProjectIds[0]).toBe(PROJECT_BETA.id);
  await expect(page.getByText(/active_project_required/i)).toHaveCount(0);
});

test("mobile: project sheet selects project and closes cleanly", async ({ page }) => {
  const state = await installApiMocks(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs");

  await expect(page.getByRole("heading", { name: "Run jobs" })).toBeVisible();
  await page.getByTestId("mobile-projects-open").click();
  await expect(page.getByTestId("mobile-projects-sheet")).toBeVisible();

  await page.getByTestId("mobile-projects-sheet").getByTestId(`project-select-${PROJECT_ALPHA.id}`).click();

  await expect(page.getByTestId("mobile-projects-sheet")).toBeHidden();
  await expect(page.getByText("Выбор: Проект Альфа")).toBeVisible();
  await expect.poll(() => state.selectedProjectIds.includes(PROJECT_ALPHA.id)).toBe(true);
  await expect(page.getByText(/active_project_required/i)).toHaveCount(0);
});
