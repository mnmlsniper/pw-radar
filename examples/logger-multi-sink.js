/**
 * Logger example: console + file simultaneously.
 *
 * Useful in CI: coloured summary on screen for quick scan, full verbose log
 * per test in logs/ as a CI artifact for post-mortem debugging.
 *
 * Run: npx pw-radar -s openapi.yaml -i coverage-output
 */

import { test as base } from "@playwright/test";
import { recordContext } from "pw-radar/playwright";

export const test = base.extend({
  api: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL });

    await use(
      recordContext(context, {
        log: {
          level: "summary",
          sink: ["console", "file"],
          logDir: "logs",
          fileFormat: "jsonl",
        },
      }),
    );

    await context.dispose();
  },
});
