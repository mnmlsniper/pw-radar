import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

import { createRecorder } from "../src/recorder/recorder.js";
import { readCoverageDir } from "../src/engine/io/reader.js";
import { loadSpec } from "../src/engine/spec/load.js";
import { buildRules } from "../src/engine/rules/registry.js";
import { computeCoverage } from "../src/engine/coverage.js";
import { tmpDir, makeCall } from "./helpers.js";

test("many recorders write to one dir without collisions (parallel workers)", async () => {
  const dir = tmpDir("swcov-conc");
  try {
    const WORKERS = 25;
    await Promise.all(
      Array.from({ length: WORKERS }, (_, i) =>
        Promise.resolve().then(() => {
          const rec = createRecorder({ outputDir: dir, meta: { workerIndex: i } });
          rec.record({ method: "GET", url: `http://h/items/${i}`, status: 200 });
          rec.record({ method: "POST", url: "http://h/items", status: 201 });
          rec.flush();
        }),
      ),
    );

    const { calls, fileCount } = readCoverageDir(dir);
    assert.equal(fileCount, WORKERS, "every worker's file survived");
    assert.equal(calls.length, WORKERS * 2, "no calls lost to races");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("retried/duplicate calls don't break the engine (counts inflate only)", async () => {
  const spec = {
    openapi: "3.0.3",
    info: { title: "Retry", version: "1.0.0" },
    paths: { "/ping": { get: { responses: { "200": {} } } } },
  };
  const parsed = await loadSpec(spec);
  const once = computeCoverage(parsed, [makeCall({ method: "GET", path: "/ping", status: 200 })], buildRules());
  const thrice = computeCoverage(
    parsed,
    [
      makeCall({ method: "GET", path: "/ping", status: 200 }),
      makeCall({ method: "GET", path: "/ping", status: 200 }),
      makeCall({ method: "GET", path: "/ping", status: 200 }),
    ],
    buildRules(),
  );

  // Same coverage classification; only processCount differs.
  assert.equal(once.operations[0]!.state, thrice.operations[0]!.state);
  assert.equal(once.summary.full, thrice.summary.full);
  assert.equal(once.operations[0]!.processCount, 1);
  assert.equal(thrice.operations[0]!.processCount, 3);
});
