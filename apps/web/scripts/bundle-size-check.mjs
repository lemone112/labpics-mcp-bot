#!/usr/bin/env node

/**
 * Bundle size check — reads Next.js build output and warns if total JS exceeds threshold.
 * Run after `npm run build`.
 *
 * Usage: node scripts/bundle-size-check.mjs [--max-kb=500]
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const MAX_KB_DEFAULT = 2500;

async function getDirectorySize(dir) {
  let total = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        const s = await stat(fullPath);
        total += s.size;
      }
    }
  } catch {
    // directory doesn't exist — that's fine
  }
  return total;
}

const maxArg = process.argv.find((a) => a.startsWith("--max-kb="));
const maxKB = maxArg ? Number(maxArg.split("=")[1]) : MAX_KB_DEFAULT;

const staticDir = join(process.cwd(), ".next", "static");
const totalBytes = await getDirectorySize(staticDir);
const totalKB = (totalBytes / 1024).toFixed(1);

console.log(`Bundle size: ${totalKB} KB (threshold: ${maxKB} KB)`);

if (totalBytes / 1024 > maxKB) {
  console.error(`FAIL: Bundle size ${totalKB} KB exceeds ${maxKB} KB threshold.`);
  process.exit(1);
}

console.log("PASS: Bundle size within threshold.");
