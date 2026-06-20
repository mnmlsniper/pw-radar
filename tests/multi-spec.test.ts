import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSpec } from "../src/engine/spec/load.js";
import { createRouter } from "../src/engine/match/router.js";
import { computeMultiCoverage, type MultiSpecInput } from "../src/engine/coverage.js";
import { buildRules } from "../src/engine/rules/registry.js";
import type { ParsedSpec } from "../src/engine/spec/model.js";
import { makeCall } from "./helpers.js";

/** Minimal 3.0 spec exposing the given `METHOD path` operations with a 200. */
async function spec(paths: Record<string, string[]>): Promise<ParsedSpec> {
  const built: Record<string, Record<string, unknown>> = {};
  for (const [path, methods] of Object.entries(paths)) {
    built[path] = {};
    for (const m of methods) built[path]![m] = { responses: { "200": {} } };
  }
  return loadSpec({ openapi: "3.0.3", info: { title: "t", version: "1" }, paths: built });
}

test("router sends each call to the spec matching its path", async () => {
  const users = await spec({ "/users/{id}": ["get"] });
  const orders = await spec({ "/orders": ["get"] });
  const router = createRouter([
    { id: "users", spec: users, basePaths: ["/api/v1"] },
    { id: "orders", spec: orders, basePaths: ["/api/v1"] },
  ]);

  assert.equal(router.route("GET", "/api/v1/users/42"), "users");
  assert.equal(router.route("GET", "/api/v1/orders"), "orders");
  assert.equal(router.route("GET", "/api/v1/payments"), null); // nowhere
});

test("router prefers the spec with the longest matching base path", async () => {
  // Both can claim /api/users/42; the one mounted deeper (/api/users) wins.
  const gateway = await spec({ "/users/{id}": ["get"] });
  const usersSvc = await spec({ "/{id}": ["get"] });
  const router = createRouter([
    { id: "gateway", spec: gateway, basePaths: ["/api"] },
    { id: "users", spec: usersSvc, basePaths: ["/api/users"] },
  ]);

  assert.equal(router.route("GET", "/api/users/42"), "users");
});

test("router breaks ties by declaration order", async () => {
  const a = await spec({ "/ping": ["get"] });
  const b = await spec({ "/ping": ["get"] });
  const first = createRouter([
    { id: "a", spec: a, basePaths: ["/api"] },
    { id: "b", spec: b, basePaths: ["/api"] },
  ]);
  assert.equal(first.route("GET", "/api/ping"), "a");

  // Reverse the order → the other one wins, proving order (not name) decides.
  const second = createRouter([
    { id: "b", spec: b, basePaths: ["/api"] },
    { id: "a", spec: a, basePaths: ["/api"] },
  ]);
  assert.equal(second.route("GET", "/api/ping"), "b");
});

test("path collision: per-spec counts both, aggregate counts once", async () => {
  const a = await spec({ "/ping": ["get"] });
  const b = await spec({ "/ping": ["get"] });
  const inputs: MultiSpecInput[] = [
    { id: "a", spec: a, basePaths: ["/api"] },
    { id: "b", spec: b, basePaths: ["/api"] },
  ];
  const calls = [makeCall({ method: "GET", path: "/api/ping", status: 200 })];

  const { aggregate, perSpec } = computeMultiCoverage(inputs, calls, buildRules());

  // per-spec: the single call covers /ping in BOTH specs independently.
  const aPing = perSpec[0]!.operations.find((o) => o.path === "/ping")!;
  const bPing = perSpec[1]!.operations.find((o) => o.path === "/ping")!;
  assert.equal(aPing.processCount, 1);
  assert.equal(bPing.processCount, 1);
  assert.equal(perSpec[0]!.specId, "a");
  assert.equal(perSpec[1]!.specId, "b");

  // aggregate: the call is attributed to ONE spec only (declaration order → a).
  const total = aggregate.operations.reduce((n, o) => n + o.processCount, 0);
  assert.equal(total, 1);
  assert.equal(aggregate.summary.full, 1);
  assert.equal(aggregate.summary.empty, 1);
  assert.equal(aggregate.missed.length, 0);
});

test("aggregate collects calls matching no spec into a single missed list", async () => {
  const users = await spec({ "/users": ["get"] });
  const orders = await spec({ "/orders": ["get"] });
  const inputs: MultiSpecInput[] = [
    { id: "users", spec: users, basePaths: ["/api"] },
    { id: "orders", spec: orders, basePaths: ["/api"] },
  ];
  const calls = [
    makeCall({ method: "GET", path: "/api/users", status: 200 }),
    makeCall({ method: "GET", path: "/api/orders", status: 200 }),
    makeCall({ method: "GET", path: "/api/legacy", status: 200 }),
    makeCall({ method: "GET", path: "/api/legacy", status: 200 }),
  ];

  const { aggregate } = computeMultiCoverage(inputs, calls, buildRules());
  assert.equal(aggregate.generation.callCount, 4);
  assert.equal(aggregate.missed.length, 1);
  assert.equal(aggregate.missed[0]!.path, "/api/legacy");
  assert.equal(aggregate.missed[0]!.count, 2);
});
