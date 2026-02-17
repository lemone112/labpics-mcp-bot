import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const requiredPaths = [
  "app/login/page.jsx",
  "app/projects/page.jsx",
  "app/jobs/page.jsx",
  "app/search/page.jsx",
  "app/control-tower/page.jsx",
  "app/crm/page.jsx",
  "app/signals/page.jsx",
  "app/offers/page.jsx",
  "app/digests/page.jsx",
  "app/analytics/page.jsx",
  "components/ui/table.jsx",
  "components/ui/kanban.jsx",
  "components/ui/inbox-list.jsx",
  "components/ui/drawer.jsx",
  "components/ui/filters.jsx",
  "components/ui/stat-tile.jsx",
  "components/ui/status-chip.jsx",
  "components/ui/empty-state.jsx",
  "components/ui/toast.jsx",
  "components/ui/skeleton-block.jsx",
  "lib/motion.js",
  "DESIGN_SYSTEM_2026.md",
];

const missing = requiredPaths.filter((relPath) => !fs.existsSync(path.join(ROOT, relPath)));

if (missing.length) {
  console.error("UI consistency check failed. Missing paths:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`UI consistency check passed (${requiredPaths.length} checks).`);
