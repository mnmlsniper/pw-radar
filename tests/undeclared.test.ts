import { test } from "node:test";
import assert from "node:assert/strict";

import { loadSpec } from "../src/engine/spec/load.js";
import { buildRules } from "../src/engine/rules/registry.js";
import { computeCoverage } from "../src/engine/coverage.js";
import type { RecordedCall } from "../src/recorder/types.js";

const spec = {
  openapi: "3.0.3",
  info: { title: "Drift", version: "1.0.0" },
  paths: {
    "/products/{id}": {
      get: {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { id: { type: "integer" }, title: { type: "string" } },
                },
              },
            },
          },
          "404": {},
        },
      },
    },
  },
};

function call(p: Partial<RecordedCall> & Pick<RecordedCall, "method" | "path" | "status">): RecordedCall {
  return { url: "http://x" + p.path, query: {}, requestHeaders: {}, requestBody: null, responseContentType: "application/json", ...p };
}

test("reports an undeclared status the server returned", async () => {
  const parsed = await loadSpec(structuredClone(spec));
  // server returns 500, which is NOT declared (only 200/404 are)
  const calls = [call({ method: "GET", path: "/products/1", status: 500, responseBodyKeys: ["id", "title"] })];
  const results = computeCoverage(parsed, calls, buildRules());

  const op = results.operations[0]!;
  const declared = op.conditions.find((c) => c.type === "only-declared-status")!;
  assert.equal(declared.covered, false);
  assert.match(declared.reason ?? "", /Undeclared status: 500/);
});

test("reports an undeclared field the server returned", async () => {
  const parsed = await loadSpec(structuredClone(spec));
  // response carries an extra "secretField" not described in the spec
  const calls = [
    call({ method: "GET", path: "/products/1", status: 200, responseBodyKeys: ["id", "title", "secretField"] }),
  ];
  const results = computeCoverage(parsed, calls, buildRules());

  const op = results.operations[0]!;
  const cond = op.conditions.find((c) => c.type === "only-declared-response-field")!;
  assert.ok(cond, "only-declared-response-field condition exists");
  assert.equal(cond.covered, false);
  assert.match(cond.reason ?? "", /Undeclared fields: secretField/);
});

test("no undeclared-field condition when spec declares no response schema", async () => {
  const bare = {
    openapi: "3.0.3",
    info: { title: "Bare", version: "1.0.0" },
    paths: { "/ping": { get: { responses: { "200": {} } } } },
  };
  const parsed = await loadSpec(bare);
  const results = computeCoverage(parsed, [call({ method: "GET", path: "/ping", status: 200, responseBodyKeys: ["x"] })], buildRules());
  const op = results.operations[0]!;
  assert.ok(op.conditions.every((c) => c.type !== "only-declared-response-field"));
});

test("covered when every returned field is declared", async () => {
  const parsed = await loadSpec(structuredClone(spec));
  const calls = [call({ method: "GET", path: "/products/1", status: 200, responseBodyKeys: ["id", "title"] })];
  const results = computeCoverage(parsed, calls, buildRules());
  const cond = results.operations[0]!.conditions.find((c) => c.type === "only-declared-response-field")!;
  assert.equal(cond.covered, true);
});
