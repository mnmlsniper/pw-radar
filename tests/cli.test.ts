import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));

const spec = {
  openapi: "3.0.3",
  info: { title: "CLI Test", version: "1.0.0" },
  paths: {
    "/products": { get: { responses: { "200": {} } } },
    "/products/{id}": { get: { responses: { "200": {}, "404": {} } } },
  },
};

const coverageFile = JSON.stringify({
  tool: "swagger-coverage-ts",
  formatVersion: 1,
  recordedAt: "2026-06-13T00:00:00Z",
  calls: [
    { method: "GET", path: "/api/v1/products", url: "x", query: {}, requestHeaders: {}, requestBody: null, status: 200, responseContentType: "application/json" },
    { method: "GET", path: "/api/v1/products/1", url: "x", query: {}, requestHeaders: {}, requestBody: null, status: 200, responseContentType: "application/json" },
  ],
});

test(
  "CLI builds reports and exits 0",
  { skip: existsSync(CLI) ? false : "run `npm run build` first" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "swcov-cli-"));
    const specPath = join(dir, "spec.json");
    const outDir = join(dir, "out");
    const html = join(dir, "report.html");
    const json = join(dir, "results.json");
    const cfg = join(dir, "cfg.json");

    writeFileSync(specPath, JSON.stringify(spec));
    writeFileSync(
      cfg,
      JSON.stringify({ basePath: "/api/v1", writers: { html: { filename: html }, json: { filename: json } } }),
    );
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "calls.json"), coverageFile);

    const stdout = execFileSync("node", [CLI, "-s", specPath, "-i", outDir, "-c", cfg], {
      encoding: "utf8",
    });

    assert.match(stdout, /Full coverage/);
    assert.ok(existsSync(html), "html report written");
    assert.ok(existsSync(json), "json report written");
    rmSync(dir, { recursive: true });
  },
);

test("CLI exits non-zero without required args", () => {
  let code = 0;
  try {
    execFileSync("node", [CLI], { encoding: "utf8", stdio: "pipe" });
  } catch (err) {
    code = (err as { status?: number }).status ?? -1;
  }
  assert.equal(code, 1);
});
