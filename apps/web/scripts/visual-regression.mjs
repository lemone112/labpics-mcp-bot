import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const BASE_URL = process.env.UI_BASE_URL || "http://127.0.0.1:3000";
const STRICT = process.env.STRICT_VISUAL_REGRESSION === "1";
const UPDATE_BASELINE = process.env.UPDATE_VISUAL_BASELINE === "1";
const PAGES = ["/login", "/projects", "/jobs", "/search", "/control-tower"];

const baselineDir = path.join(ROOT, "artifacts/visual/baseline");
const currentDir = path.join(ROOT, "artifacts/visual/current");
fs.mkdirSync(baselineDir, { recursive: true });
fs.mkdirSync(currentDir, { recursive: true });

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function main() {
  let chromium = null;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    const message = "Playwright is not installed. Install it to run visual regression screenshots.";
    if (STRICT) {
      throw new Error(message);
    }
    console.warn(message);
    process.exit(0);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const diffs = [];

  for (const route of PAGES) {
    const slug = route.replace(/[\/]/g, "_").replace(/^_+/, "") || "home";
    const currentPath = path.join(currentDir, `${slug}.png`);
    const baselinePath = path.join(baselineDir, `${slug}.png`);

    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: currentPath, fullPage: true });

    if (!fs.existsSync(baselinePath)) {
      if (UPDATE_BASELINE) {
        fs.copyFileSync(currentPath, baselinePath);
      } else if (STRICT) {
        diffs.push({ route, reason: "missing baseline" });
      }
      continue;
    }

    const currentHash = hashFile(currentPath);
    const baselineHash = hashFile(baselinePath);
    if (currentHash !== baselineHash) {
      if (UPDATE_BASELINE) {
        fs.copyFileSync(currentPath, baselinePath);
      } else {
        diffs.push({ route, reason: "hash mismatch" });
      }
    }
  }

  await browser.close();

  if (diffs.length > 0) {
    console.error("Visual regression differences detected:");
    for (const diff of diffs) {
      console.error(`- ${diff.route}: ${diff.reason}`);
    }
    process.exit(1);
  }

  console.log("Visual regression check passed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
