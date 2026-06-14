import { test } from "node:test";
import assert from "node:assert/strict";

import { loadSpec } from "../src/engine/spec/load.js";
import { buildRules } from "../src/engine/rules/registry.js";
import { computeCoverage } from "../src/engine/coverage.js";
import type { RecordedCall } from "../src/recorder/types.js";

const spec = {
  openapi: "3.0.3",
  info: { title: "Shop", version: "1.0.0" },
  servers: [{ url: "https://api.shop.test/api/v1" }],
  paths: {
    "/products/{id}": {
      get: {
        tags: ["products"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "expand", in: "query", schema: { type: "string", enum: ["price", "category"] } },
        ],
        responses: { "200": {}, "404": {} },
      },
    },
    "/products": {
      post: {
        tags: ["products"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string" },
                  status: { type: "string", enum: ["draft", "published"] },
                },
              },
            },
          },
        },
        responses: { "201": {} },
      },
    },
    "/categories": {
      get: { tags: ["categories"], responses: { "200": {} } },
    },
  },
};

function call(partial: Partial<RecordedCall> & Pick<RecordedCall, "method" | "path" | "status">): RecordedCall {
  return {
    url: "http://x" + partial.path,
    query: {},
    requestHeaders: {},
    requestBody: null,
    responseContentType: "application/json",
    ...partial,
  };
}

test("computes full/partial/empty across operations", async () => {
  const parsed = await loadSpec(structuredClone(spec));
  const rules = buildRules();

  const calls: RecordedCall[] = [
    // GET /products/{id}: both statuses, both enum values + one out-of-enum → FULL
    call({ method: "GET", path: "/api/v1/products/1", status: 200, query: { expand: "price" } }),
    call({ method: "GET", path: "/api/v1/products/2", status: 404, query: { expand: "category" } }),
    call({ method: "GET", path: "/api/v1/products/3", status: 200, query: { expand: "weird" } }),
    // POST /products: body present, status 201, but only one enum value → PARTIAL
    call({
      method: "POST",
      path: "/api/v1/products",
      status: 201,
      requestBody: { title: "Hat", status: "draft" },
    }),
    // a call that matches nothing in the spec → MISSED
    call({ method: "GET", path: "/api/v1/unknown", status: 200 }),
  ];

  const results = computeCoverage(parsed, calls, rules);

  const get = results.operations.find((o) => o.method === "GET" && o.path === "/products/{id}")!;
  assert.equal(get.state, "full", JSON.stringify(get.conditions, null, 2));
  assert.equal(get.processCount, 3);

  const post = results.operations.find((o) => o.method === "POST")!;
  assert.equal(post.state, "partial");
  // status 201 covered, body present, title present, but enum status incomplete
  const enumAll = post.conditions.find((c) => c.type === "property-enum-all-value")!;
  assert.equal(enumAll.covered, false);

  const categories = results.operations.find((o) => o.path === "/categories")!;
  assert.equal(categories.state, "empty");
  assert.equal(categories.processCount, 0);

  assert.equal(results.summary.full, 1);
  assert.equal(results.summary.partial, 1);
  assert.equal(results.summary.empty, 1);
  assert.equal(results.summary.total, 3);
  assert.equal(results.missed.length, 1);
  assert.equal(results.missed[0]!.path, "/api/v1/unknown");
});

test("excludeDeprecated moves deprecated ops out of stats", async () => {
  const withDeprecated = structuredClone(spec);
  (withDeprecated.paths["/categories"].get as Record<string, unknown>)["deprecated"] = true;

  const parsed = await loadSpec(withDeprecated);
  const results = computeCoverage(parsed, [], buildRules(), { excludeDeprecated: true });

  const categories = results.operations.find((o) => o.path === "/categories")!;
  assert.equal(categories.state, "deprecated");
  assert.equal(results.summary.deprecated, 1);
  assert.equal(results.summary.total, 2);
});

test("disabling a rule via config removes its conditions", async () => {
  const parsed = await loadSpec(structuredClone(spec));
  const rules = buildRules({ status: { enable: false } });
  const results = computeCoverage(parsed, [], rules);
  const get = results.operations.find((o) => o.method === "GET" && o.path === "/products/{id}")!;
  assert.ok(get.conditions.every((c) => c.type !== "status"));
});
