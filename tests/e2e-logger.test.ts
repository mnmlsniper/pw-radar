import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { rmSync } from "node:fs";
import { request } from "@playwright/test";

import { recordContext } from "../src/playwright/index.js";
import { readCoverageDir } from "../src/engine/io/reader.js";
import { tmpDir } from "./helpers.js";

function startServer(): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/products/")) {
      res.end(JSON.stringify({ id: 1, title: "Hat", secretField: "x" }));
    } else if (req.url?.startsWith("/products")) {
      res.statusCode = 201;
      res.end(JSON.stringify({ id: 2 }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "not found" }));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });
}

test("records real Playwright APIRequestContext calls end to end", async () => {
  const { server, port } = await startServer();
  const dir = tmpDir("swcov-e2e");
  try {
    const raw = await request.newContext({ baseURL: `http://localhost:${port}` });
    const ctx = recordContext(raw, { outputDir: dir });

    await ctx.get("/products/1");
    await ctx.post("/products", { data: { title: "Hat" } });
    await ctx.get("/missing");
    await ctx.dispose();

    const { calls, fileCount } = readCoverageDir(dir);
    assert.equal(fileCount, 1, "one file per disposed context");
    assert.equal(calls.length, 3);

    const get = calls.find((c) => c.path === "/products/1")!;
    assert.equal(get.method, "GET");
    assert.equal(get.status, 200);
    assert.deepEqual([...(get.responseBodyKeys ?? [])].sort(), ["id", "secretField", "title"]);

    const post = calls.find((c) => c.method === "POST")!;
    assert.equal(post.status, 201);
    assert.deepEqual(post.requestBody, { title: "Hat" });

    const missing = calls.find((c) => c.path === "/missing")!;
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
