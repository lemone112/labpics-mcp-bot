import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "components", "features"];
const FILE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

// Files where hex colors are expected (CSS token definitions)
const HEX_WHITELIST = new Set(["globals.css", "tailwind.config.js"]);

const forbiddenRules = [
  {
    name: "legacy-palette-utility",
    description: "Use design tokens instead of Tailwind palette utilities",
    pattern:
      /\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  },
  {
    name: "raw-hex-in-component",
    description: "Use tokens instead of raw hex colors in component/page files",
    pattern: /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
  },
  {
    name: "uppercase-utility",
    description: "Avoid uppercase utility unless semantically required",
    pattern: /\buppercase\b/,
  },
  {
    name: "inline-style",
    description: "Use tokenized utility classes instead of inline style objects",
    pattern: /style=\{\{/,
  },
  {
    name: "anime-duration-literal",
    description: "Use MOTION duration tokens for Anime.js animations",
    pattern: /\bduration:\s*\d+/,
  },
  {
    name: "anime-ease-literal",
    description: "Use MOTION easing tokens for Anime.js animations",
    pattern: /\bease:\s*["']/,
  },
  // --- NEW RULES (hardened 2026-02-19) ---
  {
    name: "arbitrary-spacing",
    description:
      "Use spacing scale tokens instead of arbitrary px values. See DESIGN_SYSTEM_2026.md section 2",
    // Matches p-[13px], m-[17px], gap-[23px], px-[10px], etc.
    // Excludes calc(), env(), var(), %, vh, vw, rem, and z-index bracket values
    pattern:
      /\b(?:p|px|py|pl|pr|pt|pb|m|mx|my|ml|mr|mt|mb|gap|gap-x|gap-y|inset|top|left|right|bottom|w|h|min-w|min-h|max-w|max-h)-\[\d+px\]/,
    exclude: /\b[z]-\[\d+\]/,
  },
  {
    name: "arbitrary-typography",
    description:
      "Use typography scale instead of arbitrary text sizes. Allowed: text-[11px] only. See DESIGN_SYSTEM_2026.md section 3",
    // Matches text-[Npx] but NOT text-[11px] (whitelisted small label)
    pattern: /\btext-\[\d+px\]/,
    whitelist: /\btext-\[11px\]/,
  },
  {
    name: "arbitrary-shadow",
    description:
      "Use shadow scale tokens (--shadow-card, --shadow-floating, --shadow-modal). See DESIGN_SYSTEM_2026.md section 5",
    // Matches shadow-[anything] EXCEPT shadow-[var(--shadow-*)]
    pattern: /\bshadow-\[(?!var\()/,
  },
  {
    name: "font-weight-forbidden",
    description:
      "Do not use font-thin or font-light. Minimum weight is font-normal (400). See DESIGN_SYSTEM_2026.md section 3",
    pattern: /\b(?:font-thin|font-light)\b/,
  },
];

function collectFiles(dirPath, accumulator = []) {
  if (!fs.existsSync(dirPath)) return accumulator;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
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

function detectViolations(filePath, source) {
  const lines = source.split("\n");
  const violations = [];
  const fileName = path.basename(filePath);

  lines.forEach((line, index) => {
    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      return;
    }

    for (const rule of forbiddenRules) {
      // Skip hex check for CSS/config files where tokens are defined
      if (rule.name === "raw-hex-in-component" && HEX_WHITELIST.has(fileName)) {
        continue;
      }

      if (rule.pattern.test(line)) {
        // Check exclude pattern (e.g., z-index brackets are fine)
        if (rule.exclude && rule.exclude.test(line)) {
          continue;
        }
        // Check whitelist (e.g., text-[11px] is permitted)
        if (rule.whitelist && rule.whitelist.test(line)) {
          continue;
        }

        violations.push({
          filePath,
          line: index + 1,
          rule: rule.name,
          description: rule.description,
          content: trimmed,
        });
      }
    }
  });

  return violations;
}

const files = TARGET_DIRS.flatMap((relativeDir) =>
  collectFiles(path.join(ROOT, relativeDir))
);

const allViolations = [];

for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");
  allViolations.push(...detectViolations(filePath, source));
}

if (allViolations.length > 0) {
  console.error("\nDesign audit failed:\n");
  for (const violation of allViolations) {
    const relative = path.relative(ROOT, violation.filePath);
    console.error(
      `- ${relative}:${violation.line} [${violation.rule}] ${violation.description}\n  ${violation.content}`
    );
  }
  console.error(`\nTotal violations: ${allViolations.length}`);
  process.exit(1);
}

console.log(`Design audit passed for ${files.length} files.`);
