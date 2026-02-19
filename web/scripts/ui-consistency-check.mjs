import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];

// ---------------------------------------------------------------------------
// 1) Required file existence
// ---------------------------------------------------------------------------

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
  "COMPONENT_SELECTION.md",
  "QUALITY_GATES_UI.md",
  "MOTION_GUIDELINES.md",
];

const missing = requiredPaths.filter(
  (relPath) => !fs.existsSync(path.join(ROOT, relPath))
);
for (const file of missing) {
  errors.push(`MISSING FILE: ${file}`);
}

// ---------------------------------------------------------------------------
// 2) Content-based guardrails
// ---------------------------------------------------------------------------

function collectJsxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsxFiles(full));
    } else if (/\.(jsx|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const featuresDir = path.join(ROOT, "features");
const componentsDir = path.join(ROOT, "components");
const appDir = path.join(ROOT, "app");

const featureFiles = collectJsxFiles(featuresDir);
const allJsxDirs = [featuresDir, appDir, componentsDir];
const allJsxFiles = allJsxDirs.flatMap((d) => collectJsxFiles(d));

// ---------------------------------------------------------------------------
// 2a) Boolean-in-Select (global check)
// ---------------------------------------------------------------------------

for (const filePath of allJsxFiles) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/SelectItem[^>]*value\s*=\s*["'](true|false)["']/i.test(line)) {
      errors.push(
        `BOOLEAN-IN-SELECT: ${relPath}:${lineNum}\n` +
          `  -> Use Switch or Checkbox for boolean controls. Select is for enums.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2b-2d) Feature-only checks
// ---------------------------------------------------------------------------

for (const filePath of featureFiles) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 2b) Raw Tailwind colors in feature code
    const rawColorPattern =
      /(?:text|bg|border)-(red|blue|green|yellow|orange|gray|slate|zinc|neutral|stone|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/;
    if (rawColorPattern.test(line)) {
      const match = line.match(rawColorPattern);
      errors.push(
        `RAW COLOR: ${relPath}:${lineNum} ("${match[0]}")\n` +
          `  -> Use semantic classes: bg-destructive, text-warning, border-primary, etc.`
      );
    }

    // 2c) DropdownMenu as state picker (expanded keyword list)
    if (/DropdownMenuItem/i.test(line)) {
      const context = lines
        .slice(Math.max(0, i - 2), Math.min(lines.length, i + 3))
        .join(" ");
      const stateKeywords =
        /\b(period|mode|view|density|filter|sort|range|interval|theme|setView|setMode|setPeriod|setFilter|setDensity|setTheme)\b/i;
      if (stateKeywords.test(context)) {
        errors.push(
          `DROPDOWN-AS-STATE: ${relPath}:${lineNum}\n` +
            `  -> DropdownMenu is for actions only. Use Select or Tabs for state selection.`
        );
      }
    }

    // 2d) Chart colors used as status semantics
    if (/chart-[1-5]/.test(line)) {
      const context = lines
        .slice(Math.max(0, i - 3), Math.min(lines.length, i + 3))
        .join(" ");
      const statusKeywords =
        /\b(severity|probability|status|risk|level|priority|impact)\b/i;
      if (statusKeywords.test(context)) {
        errors.push(
          `CHART-AS-STATUS: ${relPath}:${lineNum}\n` +
            `  -> Use StatusChip intents or semantic status classes (destructive, warning, success).\n` +
            `  -> chart-* colors are for chart data series only.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2e) NEW: Bare empty state detector (all JSX files)
// ---------------------------------------------------------------------------

const bareEmptyPatterns = [
  "Не найдено",
  "Список пуст",
  "Нет элементов",
  "Нет данных",
  "Данных пока нет",
  "Ничего не найдено",
  "Пусто",
];

for (const filePath of allJsxFiles) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, "utf8");

  // Skip the EmptyState component itself
  if (relPath.includes("empty-state")) continue;

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const phrase of bareEmptyPatterns) {
      // Match the phrase in JSX text content or string literals, but NOT inside
      // EmptyState props (title, reason, description)
      if (line.includes(phrase)) {
        // Check if this line is inside an EmptyState component (props are OK)
        const context = lines
          .slice(Math.max(0, i - 5), Math.min(lines.length, i + 1))
          .join(" ");
        const isInsideEmptyState =
          /EmptyState/.test(context) ||
          /\b(title|reason|description)\s*=/.test(line);

        if (!isInsideEmptyState) {
          errors.push(
            `BARE-EMPTY-STATE: ${relPath}:${lineNum} ("${phrase}")\n` +
              `  -> Use <EmptyState> wizard pattern (title + reason + steps + CTA). Bare text empty states are prohibited.`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2f) NEW: Wrong lang attribute detector
// ---------------------------------------------------------------------------

const layoutPath = path.join(ROOT, "app", "layout.jsx");
if (fs.existsSync(layoutPath)) {
  const layoutContent = fs.readFileSync(layoutPath, "utf8");
  if (/lang\s*=\s*["']en["']/.test(layoutContent)) {
    errors.push(
      `WRONG-LANG: app/layout.jsx\n` +
        `  -> UI language is Russian. Use lang="ru" on <html> element. See DESIGN_SYSTEM_2026.md rule 1.6.`
    );
  }
}

// ---------------------------------------------------------------------------
// 2g) NEW: DropdownMenu for theme selection (components check)
// ---------------------------------------------------------------------------

const componentFiles = collectJsxFiles(componentsDir);
for (const filePath of componentFiles) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/DropdownMenuItem/i.test(line)) {
      const context = lines
        .slice(Math.max(0, i - 2), Math.min(lines.length, i + 3))
        .join(" ");
      const themeKeywords = /\b(setTheme|theme)\b/i;
      if (themeKeywords.test(context)) {
        errors.push(
          `DROPDOWN-AS-STATE: ${relPath}:${lineNum}\n` +
            `  -> DropdownMenu is for actions only. Theme selection should use Select or Tabs.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Report
// ---------------------------------------------------------------------------

if (errors.length) {
  console.error(`UI consistency check failed (${errors.length} issues):\n`);
  for (const err of errors) {
    console.error(`  ${err}\n`);
  }
  process.exit(1);
}

const totalFileChecks = requiredPaths.length;
const totalContentFiles =
  featureFiles.length + allJsxFiles.length + componentFiles.length;
console.log(
  `UI consistency check passed (${totalFileChecks} file checks + content guardrails on ${totalContentFiles} scanned files).`
);
