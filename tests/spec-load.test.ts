import { test } from "node:test";
import assert from "node:assert/strict";

import { loadSpec } from "../src/engine/spec/load.js";

const v2spec = {
  swagger: "2.0",
  info: { title: "V2 API", version: "1.0.0" },
  basePath: "/api/v1",
  paths: {
    "/products/{id}": {
      parameters: [{ name: "id", in: "path", required: true, type: "integer" }],
      get: {
        tags: ["products"],
        parameters: [{ name: "expand", in: "query", enum: ["price", "category"] }],
        responses: { "200": {}, "404": {} },
      },
      delete: { deprecated: true, responses: { "204": {} } },
    },
    "/products": {
      post: {
        parameters: [
          {
            name: "body",
            in: "body",
            required: true,
            schema: {
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string" },
                status: { type: "string", enum: ["draft", "published"] },
              },
            },
          },
        ],
        responses: { "201": {} },
      },
    },
  },
};

const v3spec = {
  openapi: "3.0.3",
  info: { title: "V3 API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com/api/v1" }],
  paths: {
    "/products/{id}": {
      get: {
        tags: ["products"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "expand", in: "query", schema: { type: "string", enum: ["price"] } },
        ],
        responses: { "200": {}, "404": {} },
      },
    },
    "/products": {
      post: {
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
  },
};

test("loads and normalizes a Swagger 2.0 spec", async () => {
  const spec = await loadSpec(structuredClone(v2spec));
  assert.equal(spec.version, "2.0");
  assert.equal(spec.title, "V2 API");
  assert.deepEqual(spec.basePaths, ["/api/v1"]);
  assert.equal(spec.operations.length, 3);

  const get = spec.operations.find((o) => o.method === "GET" && o.path === "/products/{id}")!;
  assert.deepEqual(get.tags, ["products"]);
  const expand = get.parameters.find((p) => p.name === "expand")!;
  assert.equal(expand.in, "query");
  assert.deepEqual(expand.enum, ["price", "category"]);
  // path param merged from path level
  assert.ok(get.parameters.some((p) => p.name === "id" && p.in === "path"));
  assert.deepEqual(get.responseStatuses.sort(), ["200", "404"]);

  const del = spec.operations.find((o) => o.method === "DELETE")!;
  assert.equal(del.deprecated, true);

  const post = spec.operations.find((o) => o.method === "POST")!;
  assert.equal(post.hasBody, true);
  const status = post.bodyProperties.find((p) => p.name === "status")!;
  assert.deepEqual(status.enum, ["draft", "published"]);
  const title = post.bodyProperties.find((p) => p.name === "title")!;
  assert.equal(title.required, true);
});

test("loads and normalizes an OpenAPI 3.0 spec", async () => {
  const spec = await loadSpec(structuredClone(v3spec));
  assert.equal(spec.version, "3.0");
  assert.deepEqual(spec.basePaths, ["/api/v1"]);
  assert.equal(spec.operations.length, 2);

  const post = spec.operations.find((o) => o.method === "POST")!;
  assert.equal(post.hasBody, true);
  assert.deepEqual(
    post.bodyProperties.map((p) => p.name).sort(),
    ["status", "title"],
  );
  const get = spec.operations.find((o) => o.method === "GET")!;
  const expand = get.parameters.find((p) => p.name === "expand")!;
  assert.deepEqual(expand.enum, ["price"]);
});
