import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadSpec } from "../src/engine/spec/load.js";
import { buildRules } from "../src/engine/rules/registry.js";
import { computeCoverage } from "../src/engine/coverage.js";
import { renderHtml } from "../src/engine/report/html-writer.js";
import type { CoverageResults } from "../src/engine/results.js";
import { makeCall } from "./helpers.js";

const golden = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/golden/${name}`, import.meta.url));

const SPEC = {
  openapi: "3.0.3",
  info: { title: "Snapshot Shop", version: "1.0.0" },
  servers: [{ url: "https://api.shop.test/api/v1" }],
  paths: {
    "/products/{id}": {
      get: {
        tags: ["products"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "expand", in: "query", schema: { type: "string", enum: ["price", "category"] } },
        ],
        responses: {
          "200": {
            content: {
              "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } },
            },
          },
          "404": {},
        },
      },
    },
    "/products": {
      post: {
        tags: ["products"],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", required: ["title"], properties: { title: { type: "string" } } },
            },
          },
        },
        responses: { "201": {} },
      },
    },
    "/categories": { get: { tags: ["categories"], responses: { "200": {} } } },
  },
};

const CALLS = [
  makeCall({ method: "GET", path: "/api/v1/products/1", status: 200, query: { expand: "price" }, responseBodyKeys: ["id"] }),
  makeCall({ method: "GET", path: "/api/v1/products/2", status: 404, query: { expand: "category" } }),
  makeCall({ method: "GET", path: "/api/v1/products/3", status: 200, query: { expand: "weird" }, responseBodyKeys: ["id", "extra"] }),
  makeCall({ method: "POST", path: "/api/v1/products", status: 201, requestBody: { title: "Hat" } }),
  makeCall({ method: "GET", path: "/api/v1/legacy", status: 200 }),
];

// Build deterministic results: freeze the volatile fields so snapshots are stable.
const spec = await loadSpec(structuredClone(SPEC));
const results: CoverageResults = computeCoverage(spec, CALLS, buildRules(), { basePaths: ["/api/v1"] });
results.generatedAt = "2026-01-01T00:00:00.000Z";
results.generation.specSource = "openapi.json";

const UPDATE = process.env.SWCOV_UPDATE_SNAPSHOTS === "1";

function matchSnapshot(actual: string, name: string): void {
  const file = golden(name);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  const expected = readFileSync(file, "utf8");
  assert.equal(
    actual,
    expected,
    `Snapshot '${name}' differs. If intentional, re-run with SWCOV_UPDATE_SNAPSHOTS=1.`,
  );
}

test("HTML report matches golden snapshot", () => {
  matchSnapshot(renderHtml(results, "en", "0.###"), "report.html");
});

test("JSON result matches golden snapshot", () => {
  matchSnapshot(JSON.stringify(results, null, 2) + "\n", "results.json");
});
