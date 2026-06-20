import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test(
  "CLI measures multiple specs: per-spec files + routed aggregate",
  { skip: existsSync(CLI) ? false : "run `npm run build` first" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "swcov-multi-"));
    const usersSpec = join(dir, "users.json");
    const ordersSpec = join(dir, "orders.json");
    const outDir = join(dir, "out");
    const html = join(dir, "report.html");
    const json = join(dir, "results.json");
    const cfg = join(dir, "cfg.json");

    writeFileSync(usersSpec, JSON.stringify({
      openapi: "3.0.3", info: { title: "Users", version: "1" },
      paths: { "/users": { post: { responses: { "201": {} } } }, "/users/{id}": { get: { responses: { "200": {} } } } },
    }));
    writeFileSync(ordersSpec, JSON.stringify({
      openapi: "3.0.3", info: { title: "Orders", version: "1" },
      paths: { "/orders": { get: { responses: { "200": {} } } } },
    }));
    writeFileSync(cfg, JSON.stringify({
      basePath: "/api/v1",
      writers: { html: { filename: html }, json: { filename: json } },
    }));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "calls.json"), JSON.stringify({
      tool: "swagger-coverage-ts", formatVersion: 1, recordedAt: "2026-01-01T00:00:00Z",
      calls: [
        { method: "POST", path: "/api/v1/users", url: "x", query: {}, requestHeaders: {}, requestBody: null, status: 201, responseContentType: "application/json" },
        { method: "GET", path: "/api/v1/orders", url: "x", query: {}, requestHeaders: {}, requestBody: null, status: 200, responseContentType: "application/json" },
        { method: "GET", path: "/api/v1/legacy", url: "x", query: {}, requestHeaders: {}, requestBody: null, status: 200, responseContentType: "application/json" },
      ],
    }));

    const stdout = execFileSync(
      "node",
      [CLI, "-s", usersSpec, "-s", ordersSpec, "-i", outDir, "-c", cfg],
      { encoding: "utf8" },
    );

    assert.match(stdout, /across 2 specs/);
    assert.match(stdout, /Aggregate/);
    assert.ok(existsSync(html), "aggregate html written");
    assert.ok(existsSync(join(dir, "report-users.html")), "per-spec users html written");
    assert.ok(existsSync(join(dir, "report-orders.html")), "per-spec orders html written");

    const parsed = JSON.parse(readFileSync(json, "utf8")) as {
      aggregate: { missed: { path: string }[] };
      perSpec: { specId: string }[];
    };
    assert.equal(parsed.perSpec.length, 2);
    assert.deepEqual(parsed.perSpec.map((s) => s.specId).sort(), ["orders", "users"]);
    // only the truly-unmatched call lands in the aggregate missed list
    assert.equal(parsed.aggregate.missed.length, 1);
    assert.equal(parsed.aggregate.missed[0]!.path, "/api/v1/legacy");
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
