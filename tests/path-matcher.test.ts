import { test } from "node:test";
import assert from "node:assert/strict";

import { matchPath, createPathMatcher } from "../src/engine/match/path-matcher.js";
import type { ParsedSpec, SpecOperation } from "../src/engine/spec/model.js";

test("matchPath handles templates, statics and length", () => {
  assert.ok(matchPath("/products/{id}", "/products/123"));
  assert.ok(matchPath("/a/{x}/b/{y}", "/a/1/b/2"));
  assert.ok(!matchPath("/products/{id}", "/products/123/reviews"));
  assert.ok(!matchPath("/products/featured", "/products/123"));
  assert.ok(matchPath("/products/featured", "/products/featured"));
});

function op(method: string, path: string): SpecOperation {
  return {
    method,
    path,
    tags: [],
    deprecated: false,
    parameters: [],
    hasBody: false,
    bodyProperties: [],
    responseStatuses: [],
    responseProperties: [],
  };
}

function spec(operations: SpecOperation[], basePaths: string[] = []): ParsedSpec {
  return { version: "3.0", basePaths, operations };
}

test("prefers the most specific (static) match", () => {
  const m = createPathMatcher(spec([op("GET", "/products/{id}"), op("GET", "/products/featured")]));
  assert.equal(m.match("GET", "/products/featured")?.path, "/products/featured");
  assert.equal(m.match("GET", "/products/123")?.path, "/products/{id}");
});

test("strips known base path prefixes", () => {
  const m = createPathMatcher(spec([op("GET", "/products/{id}")], ["/api/v1"]));
  assert.equal(m.match("GET", "/api/v1/products/123")?.path, "/products/{id}");
  // still matches without prefix
  assert.equal(m.match("GET", "/products/123")?.path, "/products/{id}");
});

test("strips extra base paths supplied by the caller (spec has no servers)", () => {
  const m = createPathMatcher(spec([op("GET", "/products/{id}")]), ["/api/v1"]);
  assert.equal(m.match("GET", "/api/v1/products/123")?.path, "/products/{id}");
  // trailing slash on recorded path still matches
  assert.equal(m.match("GET", "/api/v1/products/123/")?.path, "/products/{id}");
});

test("returns null for unknown method or path", () => {
  const m = createPathMatcher(spec([op("GET", "/products/{id}")]));
  assert.equal(m.match("POST", "/products/123"), null);
  assert.equal(m.match("GET", "/categories/1"), null);
});
