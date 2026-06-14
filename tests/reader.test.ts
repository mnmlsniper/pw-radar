import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readCoverageDir } from "../src/engine/io/reader.js";
import { createRecorder } from "../src/recorder/recorder.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "swcov-read-"));
}

test("merges calls from several worker files", () => {
  const dir = tmpDir();

  // Simulate two parallel workers each writing their own file.
  for (let worker = 0; worker < 2; worker++) {
    const rec = createRecorder({ outputDir: dir, meta: { workerIndex: worker } });
    rec.record({ method: "get", url: `http://h/items/${worker}`, status: 200 });
    rec.record({ method: "post", url: "http://h/items", status: 201 });
    rec.flush();
  }

  const result = readCoverageDir(dir);
  assert.equal(result.fileCount, 2);
  assert.equal(result.calls.length, 4);
  assert.equal(result.warnings.length, 0);
  rmSync(dir, { recursive: true });
});

test("skips malformed and unknown files with warnings", () => {
  const dir = tmpDir();
  const rec = createRecorder({ outputDir: dir });
  rec.record({ method: "get", url: "http://h/ok", status: 200 });
  rec.flush();

  writeFileSync(join(dir, "broken.json"), "{ not json");
  writeFileSync(join(dir, "alien.json"), JSON.stringify({ swagger: "2.0", paths: {} }));

  const result = readCoverageDir(dir);
  assert.equal(result.fileCount, 1);
  assert.equal(result.calls.length, 1);
  assert.equal(result.warnings.length, 2);
  rmSync(dir, { recursive: true });
});

test("throws on missing directory", () => {
  assert.throws(() => readCoverageDir(join(tmpdir(), "does-not-exist-swcov")));
});
