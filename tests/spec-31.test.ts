import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { loadSpec } from "../src/engine/spec/load.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/specs/store-3.1.json", import.meta.url));

test("normalizes an OpenAPI 3.1 spec (type arrays, allOf, enum, servers)", async () => {
  const spec = await loadSpec(FIXTURE);
  assert.equal(spec.version, "3.1");
  assert.deepEqual(spec.basePaths, ["/v1"]);

  const get = spec.operations.find((o) => o.method === "GET")!;
  const kind = get.parameters.find((p) => p.name === "kind")!;
  // type ["string","null"] → first non-null type
  assert.equal(kind.type, "string");
  assert.deepEqual(kind.enum, ["a", "b"]);
  // response properties extracted for the undeclared-field rule
  assert.deepEqual(get.responseProperties.sort(), ["id", "name"]);

  const post = spec.operations.find((o) => o.method === "POST")!;
  // allOf merged → both name and status present
  assert.deepEqual(post.bodyProperties.map((p) => p.name).sort(), ["name", "status"]);
  const name = post.bodyProperties.find((p) => p.name === "name")!;
  assert.equal(name.required, true);
  const status = post.bodyProperties.find((p) => p.name === "status")!;
  assert.deepEqual(status.enum, ["on", "off"]);
});
