import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workerLoopPathTs = join(currentDir, "..", "src", "worker-loop.ts");
const workerLoopPathJs = join(currentDir, "..", "src", "worker-loop.js");
const workerLoopSource = readFileSync(existsSync(workerLoopPathTs) ? workerLoopPathTs : workerLoopPathJs, "utf8");

test("worker loop isolates per-project scheduler errors", () => {
  assert.ok(
    workerLoopSource.includes("project scheduler tick failed"),
    "worker loop must log project-level scheduler failures"
  );
  assert.ok(
    workerLoopSource.includes("projectErrors"),
    "worker loop should keep explicit project error counter"
  );
  assert.ok(
    workerLoopSource.includes("try {") && workerLoopSource.includes("await runSchedulerTick"),
    "runSchedulerTick calls must be wrapped with per-project try/catch"
  );
});
