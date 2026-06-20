import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { createLogger } from "../src/recorder/log/logger.js";
import { buildCurl } from "../src/recorder/log/curl.js";
import { tmpDir } from "./helpers.js";
import type { LogEntry } from "../src/recorder/log/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX = {
  sensitiveKeys: ["password", "token", "authorization", "cookie", "secret", "api-key", "apikey", "access_token", "refresh_token"],
  excludeHeaders: ["content-length", "host", "connection"],
};

function successCall() {
  return {
    method: "GET",
    url: "http://api.example.com/products/1",
    requestHeaders: { Accept: "application/json" },
    status: 200,
    responseContentType: "application/json",
    responseBody: { id: 1, title: "Hat" },
  };
}

function errorCall() {
  return {
    method: "POST",
    url: "http://api.example.com/login",
    requestHeaders: { Authorization: "Bearer tok123", "content-type": "application/json" },
    requestBody: { username: "neo", password: "trinity123" },
    status: 401,
    responseBody: { message: "Unauthorized" },
  };
}

// ---------------------------------------------------------------------------
// curl builder
// ---------------------------------------------------------------------------

describe("buildCurl", () => {
  test("builds minimal GET", () => {
    const c = buildCurl("GET", "http://api.example.com/items", {}, null);
    assert.ok(c.startsWith("curl -X GET 'http://api.example.com/items'"), c);
  });

  test("includes headers", () => {
    const c = buildCurl("POST", "http://api.example.com/items", { "Content-Type": "application/json" }, null);
    assert.ok(c.includes("-H 'Content-Type: application/json'"), c);
  });

  test("includes body as JSON", () => {
    const c = buildCurl("POST", "http://api.example.com/items", {}, { title: "hat" });
    assert.ok(c.includes("-d '"), c);
    assert.ok(c.includes("title"), c);
  });

  test("escapes single quotes in values", () => {
    const c = buildCurl("GET", "http://api.example.com/it's", {}, null);
    assert.ok(c.includes(`'http://api.example.com/it'\\''s'`), c);
  });
});

// ---------------------------------------------------------------------------
// Masking — headers and body in LogEntry AND in curl
// ---------------------------------------------------------------------------

describe("masking", () => {
  test("masks Authorization header and password body in entry", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger("verbose", { ...CTX, meta: {} });
    const origSink = (e: LogEntry) => collected.push(e);
    const logger2 = createLogger({ level: "verbose", sink: origSink }, CTX);
    logger2!.log(errorCall());

    const entry = collected[0]!;
    assert.notEqual(entry.requestHeaders["Authorization"], "Bearer tok123");
    assert.ok(String(entry.requestHeaders["Authorization"]).includes("*"));

    const body = entry.requestBody as Record<string, string>;
    assert.equal(body.username, "neo");
    assert.ok(body.password.includes("*"), `password should be masked: ${body.password}`);
  });

  test("masked values appear in curl (headers)", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ level: "verbose", sink: (e) => collected.push(e) }, CTX);
    logger!.log(errorCall());

    const entry = collected[0]!;
    assert.ok(!entry.curl.includes("tok123"), `raw token must not appear in curl: ${entry.curl}`);
    assert.ok(entry.curl.includes("Authorization"), "Authorization header must still be in curl");
  });

  test("excludes noise headers (content-length, host, connection)", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ level: "verbose", sink: (e) => collected.push(e) }, CTX);
    logger!.log({
      method: "GET",
      url: "http://api.example.com/items",
      requestHeaders: { "content-length": "42", "host": "api.example.com", Accept: "application/json" },
      status: 200,
    });

    const entry = collected[0]!;
    assert.ok(!("content-length" in entry.requestHeaders), "content-length must be excluded");
    assert.ok(!("host" in entry.requestHeaders), "host must be excluded");
    assert.ok("Accept" in entry.requestHeaders, "Accept must be kept");
  });

  test("maskKeys extends default sensitive list", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger(
      { level: "verbose", sink: (e) => collected.push(e), maskKeys: ["otp"] },
      CTX,
    );
    logger!.log({
      method: "POST",
      url: "http://api.example.com/verify",
      requestBody: { otp: "123456", name: "neo" },
      status: 200,
    });

    const body = collected[0]!.requestBody as Record<string, string>;
    assert.ok(body.otp.includes("*"), "custom maskKey otp must be masked");
    assert.equal(body.name, "neo");
  });
});

// ---------------------------------------------------------------------------
// createLogger — null when disabled
// ---------------------------------------------------------------------------

describe("createLogger — disabled", () => {
  test("returns null for log:false", () => {
    assert.equal(createLogger(false, CTX), null);
  });

  test("returns null for log:undefined", () => {
    assert.equal(createLogger(undefined, CTX), null);
  });
});

// ---------------------------------------------------------------------------
// onlyErrors filter
// ---------------------------------------------------------------------------

describe("onlyErrors", () => {
  test("suppresses successful calls when onlyErrors:true", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ onlyErrors: true, sink: (e) => collected.push(e) }, CTX);
    logger!.log(successCall());
    assert.equal(collected.length, 0);
  });

  test("passes error calls when onlyErrors:true", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ onlyErrors: true, sink: (e) => collected.push(e) }, CTX);
    logger!.log(errorCall());
    assert.equal(collected.length, 1);
  });

  test("passes everything when onlyErrors:false (default)", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ sink: (e) => collected.push(e) }, CTX);
    logger!.log(successCall());
    logger!.log(errorCall());
    assert.equal(collected.length, 2);
  });
});

// ---------------------------------------------------------------------------
// ok / LogEntry shape
// ---------------------------------------------------------------------------

describe("LogEntry shape", () => {
  test("ok:true for 2xx", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ sink: (e) => collected.push(e) }, CTX);
    logger!.log(successCall());
    assert.equal(collected[0]!.ok, true);
    assert.equal(collected[0]!.status, 200);
  });

  test("ok:false for 4xx", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ sink: (e) => collected.push(e) }, CTX);
    logger!.log(errorCall());
    assert.equal(collected[0]!.ok, false);
  });

  test("ok:false and error set for thrown request", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ sink: (e) => collected.push(e) }, CTX);
    logger!.log({
      method: "GET",
      url: "http://api.example.com/items",
      error: new Error("connect ECONNREFUSED"),
    });
    const entry = collected[0]!;
    assert.equal(entry.ok, false);
    assert.equal(entry.status, null);
    assert.ok(entry.error?.message.includes("ECONNREFUSED"));
  });

  test("curl always present", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger({ sink: (e) => collected.push(e) }, CTX);
    logger!.log(successCall());
    assert.ok(collected[0]!.curl.startsWith("curl -X GET"));
  });

  test("workerIndex propagated from meta", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger(
      { sink: (e) => collected.push(e) },
      { ...CTX, meta: { workerIndex: 3 } },
    );
    logger!.log(successCall());
    assert.equal(collected[0]!.workerIndex, 3);
  });
});

// ---------------------------------------------------------------------------
// needsResponseBody — drives upstream body fetching
// ---------------------------------------------------------------------------

describe("needsResponseBody", () => {
  test("summary: false for 200, true for 401", () => {
    const logger = createLogger({ level: "summary", sink: () => {} }, CTX)!;
    assert.equal(logger.needsResponseBody(200), false);
    assert.equal(logger.needsResponseBody(401), true);
    assert.equal(logger.needsResponseBody(500), true);
  });

  test("verbose: true for all statuses", () => {
    const logger = createLogger({ level: "verbose", sink: () => {} }, CTX)!;
    assert.equal(logger.needsResponseBody(200), true);
    assert.equal(logger.needsResponseBody(204), true);
  });
});

// ---------------------------------------------------------------------------
// Custom sink (object form)
// ---------------------------------------------------------------------------

describe("custom Sink object", () => {
  test("SinkObject.write is called and flush invoked on logger.flush()", () => {
    const writes: LogEntry[] = [];
    let flushed = false;
    const logger = createLogger(
      {
        sink: {
          write(e) { writes.push(e); },
          flush() { flushed = true; },
        },
      },
      CTX,
    )!;
    logger.log(successCall());
    assert.equal(writes.length, 1);
    logger.flush();
    assert.equal(flushed, true);
  });
});

// ---------------------------------------------------------------------------
// Multiple sinks
// ---------------------------------------------------------------------------

describe("multiple sinks", () => {
  test("entry dispatched to all sinks in array", () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    const logger = createLogger(
      { sink: [(e) => a.push(e), (e) => b.push(e)] },
      CTX,
    )!;
    logger.log(successCall());
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
  });
});

// ---------------------------------------------------------------------------
// File sink — per-test file, worker in name, forced masking, format
// ---------------------------------------------------------------------------

describe("file sink", () => {
  test("writes one file per flush with worker index in name", () => {
    const dir = tmpDir("swcov-log");
    const logger = createLogger(
      { sink: "file", logDir: dir },
      { ...CTX, meta: { workerIndex: 2, title: "my test" } },
    )!;
    logger.log(successCall());
    logger.flush();

    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    assert.ok(files[0]!.includes("-w2-"), `worker index in filename: ${files[0]}`);
    rmSync(dir, { recursive: true });
  });

  test("no file written when no calls logged", () => {
    const dir = tmpDir("swcov-log");
    const logger = createLogger({ sink: "file", logDir: dir }, { ...CTX, meta: {} })!;
    logger.flush();
    assert.equal(readdirSync(dir).length, 0);
    rmSync(dir, { recursive: true });
  });

  test("forces masking even when mask:false is requested", () => {
    const dir = tmpDir("swcov-log");
    const logger = createLogger(
      { sink: "file", logDir: dir, mask: false },
      { ...CTX, meta: {} },
    )!;
    logger.log(errorCall());
    logger.flush();

    const files = readdirSync(dir);
    const content = readFileSync(join(dir, files[0]!), "utf8");
    assert.ok(!content.includes("tok123"), "raw token must not appear in file");
    assert.ok(!content.includes("trinity123"), "raw password must not appear in file");
    rmSync(dir, { recursive: true });
  });

  test("jsonl format writes one JSON object per line", () => {
    const dir = tmpDir("swcov-log");
    const logger = createLogger(
      { sink: "file", logDir: dir, fileFormat: "jsonl" },
      { ...CTX, meta: {} },
    )!;
    logger.log(successCall());
    logger.log(errorCall());
    logger.flush();

    const files = readdirSync(dir);
    assert.ok(files[0]!.endsWith(".jsonl"), files[0]);
    const lines = readFileSync(join(dir, files[0]!), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.equal(lines.length, 2);
    const parsed = JSON.parse(lines[0]!) as LogEntry;
    assert.equal(parsed.method, "GET");
    rmSync(dir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// Shorthand forms (true / level string)
// ---------------------------------------------------------------------------

describe("shorthand LogConfig", () => {
  test("true enables logger with default options", () => {
    const collected: LogEntry[] = [];
    const logger = createLogger(true, { ...CTX, meta: {} });
    // can't override sink from shorthand — just ensure it doesn't throw and returns non-null
    assert.notEqual(logger, null);
  });

  test("'summary' string creates summary logger", () => {
    assert.notEqual(createLogger("summary", CTX), null);
  });

  test("'verbose' string creates verbose logger", () => {
    assert.notEqual(createLogger("verbose", CTX), null);
  });
});
