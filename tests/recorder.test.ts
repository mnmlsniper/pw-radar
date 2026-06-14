import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRecorder } from "../src/recorder/recorder.js";
import { recordContext } from "../src/playwright/index.js";
import type { CoverageFile } from "../src/recorder/types.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "swcov-"));
}

function readFiles(dir: string): CoverageFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CoverageFile);
}

test("recorder normalizes url into path + query", () => {
  const dir = tmpDir();
  const rec = createRecorder({ outputDir: dir });
  rec.record({
    method: "get",
    url: "https://api.example.com/api/v1/products/123?title=foo&tag=a&tag=b",
    status: 200,
    responseContentType: "application/json; charset=utf-8",
  });
  assert.equal(rec.size, 1);
  const written = rec.flush();
  assert.ok(written);
  assert.equal(rec.size, 0);

  const [file] = readFiles(dir);
  assert.equal(file.calls.length, 1);
  const call = file.calls[0]!;
  assert.equal(call.method, "GET");
  assert.equal(call.path, "/api/v1/products/123");
  assert.deepEqual(call.query, { title: "foo", tag: ["a", "b"] });
  assert.equal(call.responseContentType, "application/json");
  rmSync(dir, { recursive: true });
});

test("recorder masks sensitive headers and body values", () => {
  const dir = tmpDir();
  const rec = createRecorder({ outputDir: dir });
  rec.record({
    method: "post",
    url: "http://localhost/login",
    requestHeaders: { Authorization: "Bearer supersecrettoken", Accept: "application/json" },
    requestBody: { username: "neo", password: "trinity123" },
    status: 201,
  });
  rec.flush();

  const call = readFiles(dir)[0]!.calls[0]!;
  assert.notEqual(call.requestHeaders["Authorization"], "Bearer supersecrettoken");
  assert.equal(call.requestHeaders["Accept"], "application/json");
  const body = call.requestBody as Record<string, string>;
  assert.equal(body.username, "neo");
  assert.notEqual(body.password, "trinity123");
  rmSync(dir, { recursive: true });
});

test("flush on empty buffer writes nothing", () => {
  const dir = tmpDir();
  const rec = createRecorder({ outputDir: dir });
  assert.equal(rec.flush(), null);
  assert.equal(readdirSync(dir).length, 0);
  rmSync(dir, { recursive: true });
});

test("recordContext intercepts verbs and flushes on dispose", async () => {
  const dir = tmpDir();

  // Minimal fake APIRequestContext.
  const makeResponse = (url: string, status: number) => ({
    url: () => url,
    status: () => status,
    headers: () => ({ "content-type": "application/json" }),
  });
  const fakeCtx = {
    async get(url: string) {
      return makeResponse("http://localhost" + url, 200);
    },
    async post(url: string, _opts: unknown) {
      return makeResponse("http://localhost" + url, 201);
    },
    async dispose() {
      /* no-op */
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = recordContext(fakeCtx as any, { outputDir: dir });
  await ctx.get("/products");
  await ctx.post("/products", { data: { title: "x" } });
  assert.equal(readdirSync(dir).length, 0, "nothing written before dispose");

  await ctx.dispose();

  const files = readFiles(dir);
  assert.equal(files.length, 1);
  const methods = files[0]!.calls.map((c) => c.method).sort();
  assert.deepEqual(methods, ["GET", "POST"]);
  rmSync(dir, { recursive: true });
});
