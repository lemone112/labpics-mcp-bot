import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "components", "features"];
const FILE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

// ---------------------------------------------------------------------------
// Line-level rules: each line is checked independently
// ---------------------------------------------------------------------------
const lineRules = [
  // ── Original rules ──────────────────────────────────────────────────────
  {
    name: "legacy-palette-utility",
    description: "Use design tokens instead of Tailwind palette utilities",
    pattern:
      /\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    severity: "error",
    source: "design-system",
  },
  {
    name: "raw-hex-in-component",
    description: "Use tokens instead of raw hex colors in component/page files",
    pattern: /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
    severity: "error",
    source: "design-system",
  },
  {
    name: "uppercase-utility",
    description: "Avoid uppercase utility unless semantically required",
    pattern: /\buppercase\b/,
    severity: "error",
    source: "design-system",
  },
  {
    name: "inline-style",
    description: "Use tokenized utility classes instead of inline style objects",
    pattern: /style=\{\{/,
    severity: "error",
    source: "design-system",
  },
  {
    name: "anime-duration-literal",
    description: "Use MOTION duration tokens for Anime.js animations",
    pattern: /\bduration:\s*\d+/,
    severity: "error",
    source: "motion-guidelines",
  },
  {
    name: "anime-ease-literal",
    description: "Use MOTION easing tokens for Anime.js animations",
    pattern: /\bease:\s*["']/,
    severity: "error",
    source: "motion-guidelines",
  },

  // ── New rules from ui-ux-pro-max skill ──────────────────────────────────
  {
    name: "antipattern-transition-all",
    description:
      "Use specific transition properties (transition-colors, transition-opacity, etc.)",
    pattern: /\btransition-all\b/,
    severity: "warn",
    source: "web-interface#28",
    // shadcn/ui components may use transition-all; only flag in user code
    fileExclude: /[\\/]components[\\/]ui[\\/]/,
  },
  {
    name: "antipattern-z-extreme",
    description:
      "Use z-index scale (z-10, z-20, z-30, z-50) instead of extreme values",
    pattern: /\bz-\[\d{4,}\]/,
    severity: "error",
    source: "ux-guidelines#15",
  },
  {
    name: "a11y-dangerously-set-html",
    description:
      "Audit XSS risk: dangerouslySetInnerHTML bypasses React escaping",
    pattern: /dangerouslySetInnerHTML/,
    severity: "warn",
    source: "web-interface",
  },
  {
    name: "ux-text-micro",
    description:
      "Text below 10px is unreadable; use text-xs (12px) or larger",
    // Matches text-[0px] through text-[9px]
    pattern: /\btext-\[[0-9]px\]/,
    severity: "warn",
    source: "ux-guidelines#67",
    // Allow micro-text in purposely small UI elements (badges, nav indicators)
    fileExclude: /[\\/]components[\\/]ui[\\/]nav-badge/,
  },
  {
    name: "antipattern-block-paste",
    description:
      "Never block paste on inputs — harms UX and accessibility",
    pattern: /onPaste.*preventDefault|preventDefault.*onPaste/,
    severity: "error",
    source: "web-interface#12",
  },
  {
    name: "a11y-img-no-alt",
    description: "Images must have alt text for screen readers",
    // Matches <img without alt= in the same line
    pattern: /<img\b(?![^>]*\balt\b)[^>]*>/,
    severity: "error",
    source: "ux-guidelines#38",
  },
];

// ---------------------------------------------------------------------------
// File-level rules: check whole file content as a unit
// ---------------------------------------------------------------------------
const fileRules = [
  {
    name: "a11y-anime-no-motion-check",
    description:
      "Files using anime.js must import from @/lib/motion (respects prefers-reduced-motion)",
    severity: "error",
    source: "ux-guidelines#9,#99",
    // File imports anime directly instead of using the motion wrapper
    test(source, filePath) {
      // Only check files that actually use anime
      const usesAnime =
        /from\s+["']animejs["']/.test(source) ||
        /from\s+["']anime["']/.test(source) ||
        /import\s+anime\b/.test(source);
      if (!usesAnime) return null;

      // Check if they import from the motion wrapper
      const usesMotionWrapper =
        /from\s+["']@\/lib\/motion["']/.test(source) ||
        /motionEnabled/.test(source) ||
        /useReducedMotion/.test(source);

      if (usesMotionWrapper) return null;

      return {
        line: 1,
        content:
          "File imports anime directly — use @/lib/motion wrapper instead",
      };
    },
  },
  {
    name: "a11y-missing-reduced-motion",
    description:
      "Components with animations should respect prefers-reduced-motion",
    severity: "warn",
    source: "ux-guidelines#9,#99",
    test(source, filePath) {
      // Only check files that use anime() calls (not just Tailwind animate-)
      const hasAnimeCalls = /\banime\s*\(/.test(source);
      if (!hasAnimeCalls) return null;

      // Check if motion preference is respected
      const respectsMotion =
        /motionEnabled/.test(source) ||
        /useReducedMotion/.test(source) ||
        /prefers-reduced-motion/.test(source) ||
        /MOTION\./.test(source);

      if (respectsMotion) return null;

      return {
        line: 1,
        content:
          "File uses anime() but does not check prefers-reduced-motion",
      };
    },
  },
];

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------
function collectFiles(dirPath, accumulator = []) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return accumulator;
  }
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolutePath, accumulator);
      continue;
    }
    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }
    accumulator.push(absolutePath);
  }
  return accumulator;
}

// ---------------------------------------------------------------------------
// Detection engine
// ---------------------------------------------------------------------------
function detectViolations(filePath, source) {
  const lines = source.split("\n");
  const violations = [];

  // Line-level checks
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const rule of lineRules) {
      if (rule.fileExclude && rule.fileExclude.test(filePath)) continue;
      if (rule.pattern.test(line)) {
        violations.push({
          filePath,
          line: index + 1,
          rule: rule.name,
          description: rule.description,
          severity: rule.severity,
          source: rule.source,
          content: line.trim(),
        });
      }
    }
  }

  // File-level checks
  for (const rule of fileRules) {
    const result = rule.test(source, filePath);
    if (result) {
      violations.push({
        filePath,
        line: result.line,
        rule: rule.name,
        description: rule.description,
        severity: rule.severity,
        source: rule.source,
        content: result.content,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const files = TARGET_DIRS.flatMap((relativeDir) => {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) return [];
  return collectFiles(dir);
});

const allViolations = [];

for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");
  allViolations.push(...detectViolations(filePath, source));
}

const errors = allViolations.filter((v) => v.severity === "error");
const warnings = allViolations.filter((v) => v.severity === "warn");

// Print warnings (non-blocking)
if (warnings.length > 0) {
  console.warn("\nDesign audit warnings:\n");
  for (const w of warnings) {
    const relative = path.relative(ROOT, w.filePath);
    console.warn(
      `  ⚠ ${relative}:${w.line} [${w.rule}] ${w.description}\n    ${w.content}`
    );
  }
  console.warn(`\n  ${warnings.length} warning(s)\n`);
}

// Print errors (blocking)
if (errors.length > 0) {
  console.error("\nDesign audit FAILED:\n");
  for (const e of errors) {
    const relative = path.relative(ROOT, e.filePath);
    console.error(
      `  ✗ ${relative}:${e.line} [${e.rule}] ${e.description}\n    ${e.content}`
    );
  }
  console.error(`\n  ${errors.length} error(s)`);
  process.exit(1);
}

const ruleCount = lineRules.length + fileRules.length;
console.log(
  `Design audit passed — ${files.length} files checked against ${ruleCount} rules.`
);
if (warnings.length > 0) {
  console.log(`  (${warnings.length} non-blocking warnings above)`);
}
