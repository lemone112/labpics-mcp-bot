import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];

// ---------------------------------------------------------------------------
// 1) Required file existence (original check)
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
];

const missing = requiredPaths.filter((relPath) => !fs.existsSync(path.join(ROOT, relPath)));
for (const file of missing) {
  errors.push(`MISSING FILE: ${file}`);
}

// ---------------------------------------------------------------------------
// 2) Content-based guardrails (scan features/** for common mistakes)
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
const featureFiles = collectJsxFiles(featuresDir);

// Also scan components for Select misuse (applies globally)
const allJsxDirs = [featuresDir, path.join(ROOT, "app")];
const allJsxFiles = allJsxDirs.flatMap((d) => collectJsxFiles(d));

for (const filePath of allJsxFiles) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 2a) Boolean-in-Select: SelectItem value="true" or value="false"
    if (/SelectItem[^>]*value\s*=\s*["'](true|false)["']/i.test(line)) {
      errors.push(
        `BOOLEAN-IN-SELECT: ${relPath}:${lineNum}\n` +
        `  → Use Switch or Checkbox for boolean controls. Select is for enums.`
      );
    }
  }
}

// Feature-only checks (raw colors, dropdown-as-state, chart-as-status)
for (const filePath of featureFiles) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 2b) Raw Tailwind colors in feature code
    const rawColorPattern = /(?:text|bg|border)-(red|blue|green|yellow|orange|gray|slate|zinc|neutral|stone|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/;
    if (rawColorPattern.test(line)) {
      const match = line.match(rawColorPattern);
      errors.push(
        `RAW COLOR: ${relPath}:${lineNum} ("${match[0]}")\n` +
        `  → Use semantic classes: bg-destructive, text-warning, border-primary, etc.`
      );
    }

    // 2c) DropdownMenu as state picker (heuristic: DropdownMenuItem with state keywords)
    if (/DropdownMenuItem/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join(" ");
      const stateKeywords = /\b(period|mode|view|density|filter|sort|range|interval|setView|setMode|setPeriod|setFilter|setDensity)\b/i;
      if (stateKeywords.test(context)) {
        errors.push(
          `DROPDOWN-AS-STATE: ${relPath}:${lineNum}\n` +
          `  → DropdownMenu is for actions only. Use Select or Tabs for state selection.`
        );
      }
    }

    // 2d) Chart colors used as status semantics (heuristic)
    if (/chart-[1-5]/.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join(" ");
      const statusKeywords = /\b(severity|probability|status|risk|level|priority|impact)\b/i;
      if (statusKeywords.test(context)) {
        errors.push(
          `CHART-AS-STATUS: ${relPath}:${lineNum}\n` +
          `  → Use StatusChip intents or semantic status classes (destructive, warning, success).\n` +
          `  → chart-* colors are for chart data series only.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Single primary CTA per section (§1.1 DESIGN_SYSTEM_CONTROL_TOWER.md)
// ---------------------------------------------------------------------------

const sectionPagePath = path.join(ROOT, "features/control-tower/section-page.jsx");
if (fs.existsSync(sectionPagePath)) {
  const sectionContent = fs.readFileSync(sectionPagePath, "utf8");
  const ctaMatches = sectionContent.match(/data-testid\s*=\s*["']primary-cta["']/g) || [];
  if (ctaMatches.length === 0) {
    errors.push("PRIMARY-CTA: features/control-tower/section-page.jsx has 0 primary-cta elements (expected exactly 1)");
  } else if (ctaMatches.length > 1) {
    errors.push(`PRIMARY-CTA: features/control-tower/section-page.jsx has ${ctaMatches.length} primary-cta elements (expected exactly 1)`);
  }
}

// ---------------------------------------------------------------------------
// 4) Report
// ---------------------------------------------------------------------------

if (errors.length) {
  console.error(`UI consistency check failed (${errors.length} issues):\n`);
  for (const err of errors) {
    console.error(`  ${err}\n`);
  }
  process.exit(1);
}

console.log(`UI consistency check passed (${requiredPaths.length} file checks + content guardrails on ${featureFiles.length} feature files).`);
