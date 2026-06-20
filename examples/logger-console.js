/**
 * Logger example: console output (local debugging).
 *
 * summary (default) — compact line for 2xx, full detail for 4xx/5xx/errors.
 * verbose           — full detail for every request.
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
        log: "summary",
        // log: "verbose",          // uncomment to expand all requests
        // log: { level: "summary", onlyErrors: true },  // only 4xx/5xx
      }),
    );

    await context.dispose();
  },
});
