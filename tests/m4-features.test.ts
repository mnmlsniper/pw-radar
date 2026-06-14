import { test } from "node:test";
import assert from "node:assert/strict";

import { loadSpec } from "../src/engine/spec/load.js";
import { buildRules } from "../src/engine/rules/registry.js";
import { computeCoverage } from "../src/engine/coverage.js";
import { makeCall } from "./helpers.js";

test("c5: oneOf/anyOf body properties are unioned", async () => {
  const spec = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
      "/thing": {
        post: {
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "object", properties: { a: { type: "string" } } },
                    { type: "object", properties: { b: { type: "string", enum: ["x", "y"] } } },
                  ],
                },
              },
            },
          },
          responses: { "201": {} },
        },
      },
    },
  });
  const post = spec.operations[0]!;
  assert.deepEqual(post.bodyProperties.map((p) => p.name).sort(), ["a", "b"]);
  assert.deepEqual(post.bodyProperties.find((p) => p.name === "b")!.enum, ["x", "y"]);
});

test("d5: array parameter enum comes from items (v3 and v2)", async () => {
  const v3 = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
      "/list": {
        get: {
          parameters: [
            { name: "tags", in: "query", schema: { type: "array", items: { type: "string", enum: ["a", "b"] } } },
          ],
          responses: { "200": {} },
        },
      },
    },
  });
  const p3 = v3.operations[0]!.parameters.find((p) => p.name === "tags")!;
  assert.equal(p3.type, "array");
  assert.deepEqual(p3.enum, ["a", "b"]);

  const v2 = await loadSpec({
    swagger: "2.0",
    info: { title: "t", version: "1" },
    paths: {
      "/list": {
        get: {
          parameters: [
            { name: "ids", in: "query", type: "array", items: { type: "string", enum: ["1", "2"] } },
          ],
          responses: { "200": {} },
        },
      },
    },
  });
  assert.deepEqual(v2.operations[0]!.parameters.find((p) => p.name === "ids")!.enum, ["1", "2"]);
});

test("d6: content-typed parameter (parameter.content) yields enum/type", async () => {
  const spec = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
      "/q": {
        get: {
          parameters: [
            { name: "filter", in: "query", content: { "application/json": { schema: { type: "string", enum: ["p", "q"] } } } },
          ],
          responses: { "200": {} },
        },
      },
    },
  });
  const param = spec.operations[0]!.parameters.find((p) => p.name === "filter")!;
  assert.equal(param.type, "string");
  assert.deepEqual(param.enum, ["p", "q"]);
});

test("f2: status ranges (2XX) and default are matched", async () => {
  const spec = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: { "/r": { get: { responses: { "2XX": {}, default: {} } } } },
  });
  // a 200 covers the "2XX" status condition and is not "undeclared"
  const ok = computeCoverage(spec, [makeCall({ method: "GET", path: "/r", status: 200 })], buildRules());
  const op = ok.operations[0]!;
  assert.equal(op.conditions.find((c) => c.name === "HTTP status 2XX")!.covered, true);
  assert.equal(op.conditions.find((c) => c.type === "only-declared-status")!.covered, true);
});

test("g3: path-level servers contribute base paths", async () => {
  const spec = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
      "/widgets": { servers: [{ url: "https://h/api/v2" }], get: { responses: { "200": {} } } },
    },
  });
  assert.ok(spec.basePaths.includes("/api/v2"));
  // a recorded call under /api/v2 matches
  const results = computeCoverage(
    spec,
    [makeCall({ method: "GET", path: "/api/v2/widgets", status: 200 })],
    buildRules(),
    { basePaths: spec.basePaths },
  );
  assert.equal(results.operations[0]!.processCount, 1);
});

test("h4: empty paths, parameter-only path items and x-* extensions don't break", async () => {
  const empty = await loadSpec({ openapi: "3.0.3", info: { title: "t", version: "1" }, paths: {} });
  assert.equal(empty.operations.length, 0);

  const mixed = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
      "/y": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], "x-internal": true },
      "/z": { get: { "x-foo": 1, responses: { "200": {} } } },
    },
  });
  // only /z GET is a real operation; /y has no method
  assert.deepEqual(
    mixed.operations.map((o) => `${o.method} ${o.path}`),
    ["GET /z"],
  );
});

test("e4: nested body objects and arrays of objects become dotted properties", async () => {
  const spec = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
      "/orders": {
        post: {
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    address: {
                      type: "object",
                      properties: { city: { type: "string", enum: ["NY", "LA"] } },
                    },
                    items: {
                      type: "array",
                      items: { type: "object", properties: { sku: { type: "string" } } },
                    },
                  },
                },
              },
            },
          },
          responses: { "201": {} },
        },
      },
    },
  });
  const post = spec.operations[0]!;
  const names = post.bodyProperties.map((p) => p.name).sort();
  assert.deepEqual(names, ["address", "address.city", "items", "items.sku"]);

  // enum coverage works on the nested + array path
  const r = computeCoverage(
    spec,
    [
      makeCall({ method: "POST", path: "/orders", status: 201, requestBody: { address: { city: "NY" }, items: [{ sku: "a" }, { sku: "b" }] } }),
      makeCall({ method: "POST", path: "/orders", status: 201, requestBody: { address: { city: "LA" } } }),
    ],
    buildRules(),
  );
  const op = r.operations[0]!;
  assert.equal(op.conditions.find((c) => c.name.startsWith("«address.city»") && c.type === "property-enum-all-value")!.covered, true);
  assert.equal(op.conditions.find((c) => c.name === "«items.sku» is not empty")!.covered, true);
});

test("g2: server variables are substituted with their defaults", async () => {
  const spec = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    servers: [
      { url: "https://{host}/api/{ver}", variables: { host: { default: "example.com" }, ver: { default: "v3" } } },
    ],
    paths: { "/ping": { get: { responses: { "200": {} } } } },
  });
  assert.ok(spec.basePaths.includes("/api/v3"), JSON.stringify(spec.basePaths));
});

test("b3: 3.1 const acts as a single-value enum and webhooks aren't operations", async () => {
  const spec = await loadSpec({
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    webhooks: { ping: { post: { responses: { "200": {} } } } },
    paths: {
      "/x": {
        get: {
          parameters: [{ name: "kind", in: "query", schema: { const: "fixed" } }],
          responses: { "200": {} },
        },
      },
    },
  });
  // webhooks must not appear as operations
  assert.deepEqual(spec.operations.map((o) => `${o.method} ${o.path}`), ["GET /x"]);
  const kind = spec.operations[0]!.parameters.find((p) => p.name === "kind")!;
  assert.deepEqual(kind.enum, ["fixed"]);
});

test("d3: parameter deprecated and default are captured", async () => {
  const spec = await loadSpec({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {
      "/x": {
        get: {
          parameters: [
            { name: "limit", in: "query", deprecated: true, schema: { type: "integer", default: 10 } },
          ],
          responses: { "200": {} },
        },
      },
    },
  });
  const limit = spec.operations[0]!.parameters.find((p) => p.name === "limit")!;
  assert.equal(limit.deprecated, true);
  assert.equal(limit.default, 10);
});

test("b2: validate flag rejects a structurally invalid spec", async () => {
  // OpenAPI 3.0 requires response.description; lenient parse tolerates it.
  const bad = {
    openapi: "3.0.0",
    info: { title: "t", version: "1" },
    paths: { "/x": { get: { responses: { "200": {} } } } },
  };
  await assert.doesNotReject(loadSpec(structuredClone(bad)));
  await assert.rejects(loadSpec(structuredClone(bad), { validate: true }), /specification/i);
});
