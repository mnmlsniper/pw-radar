import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNumber } from "../src/engine/report/number-format.js";

test("formatNumber honors common patterns", () => {
  assert.equal(formatNumber(58.824, "0.###"), "58.824");
  assert.equal(formatNumber(58.824, "0.##"), "58.82");
  assert.equal(formatNumber(58.824, "0.0"), "58.8");
  assert.equal(formatNumber(58.824, "0"), "59");
  assert.equal(formatNumber(100, "0.##"), "100");
  assert.equal(formatNumber(0, "0.##"), "0");
  assert.equal(formatNumber(33.3, "0.00"), "33.30");
});
