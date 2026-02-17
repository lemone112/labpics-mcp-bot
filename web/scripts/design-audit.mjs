import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["app", "components"];
const FILE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

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
    name: "tracking-utility",
    description: "Avoid tracking utilities in default UI rhythm",
    pattern: /\btracking-[^\s"']+/,
  },
];

function collectFiles(dirPath, accumulator = []) {
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

function isAllowedShadowLine(line) {
  return (
    line.includes("shadow-none") ||
    line.includes("group-data-[focus=true]:shadow-[") ||
    line.includes("focus-visible:shadow-[")
  );
}

function detectViolations(filePath, source) {
  const lines = source.split("\n");
  const violations = [];

  lines.forEach((line, index) => {
    for (const rule of forbiddenRules) {
      if (rule.pattern.test(line)) {
        violations.push({
          filePath,
          line: index + 1,
          rule: rule.name,
          description: rule.description,
          content: line.trim(),
        });
      }
    }

    if (line.includes("shadow-") && !isAllowedShadowLine(line)) {
      violations.push({
        filePath,
        line: index + 1,
        rule: "shadow-utility",
        description: "Avoid shadow utilities unless strictly necessary",
        content: line.trim(),
      });
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
