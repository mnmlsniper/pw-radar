/**
 * Logger example: per-test log files in logs/.
 *
 * Each test writes its own file: logs/<title>-w<workerIndex>-<uuid>.log
 * Masking is always forced for file output (CI artifact leak guard).
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
          level: "verbose",
          sink: "file",
          logDir: "logs",
          fileFormat: "pretty", // or "jsonl" for machine-readable
        },
      }),
    );

    await context.dispose();
  },
});
