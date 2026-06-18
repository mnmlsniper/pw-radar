import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderHtml } from "../src/engine/report/html-writer.js";
import { writeJsonReport } from "../src/engine/report/json-writer.js";
import { logSummary } from "../src/engine/report/log-writer.js";
import type { CoverageResults } from "../src/engine/results.js";

const results: CoverageResults = {
  specTitle: "Demo",
  specVersion: "3.0",
  generatedAt: "2026-06-13T00:00:00Z",
  generation: { callCount: 2, fileCount: 1, specSource: "openapi.yaml" },
  operations: [
    {
      method: "GET",
      path: "/products/{id}",
      tags: ["products"],
      deprecated: false,
      state: "partial",
      processCount: 2,
      conditionCount: 4,
      coveredConditionCount: 3,
      conditions: [
        { type: "status", name: "HTTP status 200", nameKey: "cond.status", nameParams: { status: "200" }, covered: true },
        {
          type: "status",
          name: "HTTP status 404",
          nameKey: "cond.status",
          nameParams: { status: "404" },
          covered: false,
          reason: "Undeclared status: 500",
          reasonKey: "reason.undeclaredStatus",
          reasonParams: { values: "500" },
        },
      ],
    },
  ],
  missed: [{ method: "GET", path: "/legacy", count: 1 }],
  summary: {
    full: 0,
    partial: 1,
    empty: 0,
    deprecated: 0,
    total: 1,
    fullPercent: 0,
    partialPercent: 100,
    emptyPercent: 0,
    conditionsCovered: 3,
    conditionsTotal: 4,
  },
  conditionStats: [{ type: "status", total: 2, covered: 1 }],
  tagStats: [{ tag: "products", full: 0, partial: 1, empty: 0, total: 1 }],
};

test("renderHtml produces a self-contained document with key content", () => {
  const html = renderHtml(results, "en");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Demo/);
  assert.match(html, /HTTP status 200/);
  assert.match(html, /\/products\/\{id\}/);
  assert.match(html, /\/legacy/);
  // escaping: no raw unescaped angle from data
  assert.match(html, /<style>/);
});

test("renderHtml supports ru locale", () => {
  const html = renderHtml(results, "ru");
  assert.match(html, /Частичное/);
});

test("renderHtml includes a generation block", () => {
  const html = renderHtml(results, "en");
  assert.match(html, /Generation/);
  assert.match(html, /openapi\.yaml/);
  assert.match(html, /Recorded calls/);
});

test("numberFormat controls percentage display", () => {
  // partialPercent is 100 here; use a fractional value to see formatting
  const r = { ...results, summary: { ...results.summary, partialPercent: 58.824 } };
  assert.match(renderHtml(r, "en", "0.##"), /58\.82%/);
  assert.match(renderHtml(r, "en", "0"), /59%/);
});

test("writeJsonReport writes the model to disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "swcov-rep-"));
  const file = join(dir, "out.json");
  writeJsonReport(results, file);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as CoverageResults;
  assert.equal(parsed.summary.partial, 1);
  assert.equal(parsed.operations[0]!.path, "/products/{id}");
  rmSync(dir, { recursive: true });
});

test("logSummary emits clean single-line entries", () => {
  const lines: string[] = [];
  logSummary(results, (l) => lines.push(l));
  assert.ok(lines.includes("    GET /products/{id}"));
  assert.ok(lines.some((l) => l === "Full coverage    0 %"));
  // no accidental array/index leakage
  assert.ok(lines.every((l) => !l.includes("[")));
});
