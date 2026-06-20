/**
 * Logger example: Allure attachments.
 *
 * Each request becomes two Allure attachments: curl (text/plain) and response
 * body (application/json). Allure groups them per test automatically — no
 * interleaving even with parallel workers.
 *
 * Requires: allure-playwright installed in your project.
 * Run: npx pw-radar -s openapi.yaml -i coverage-output
 */

import { test as base, expect } from "@playwright/test";
import { recordContext } from "pw-radar/playwright";
import { allure } from "allure-playwright";

export const test = base.extend({
  api: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL });

    await use(
      recordContext(context, {
        log: {
          level: "verbose",
          sink: (entry) => {
            // curl is always present — even for thrown/failed requests
            allure.attachment("curl", entry.curl, { contentType: "text/plain" });

            if (entry.responseBody !== undefined) {
              allure.attachment(
                "response",
                JSON.stringify(entry.responseBody, null, 2),
                { contentType: "application/json" },
              );
            }

            if (entry.error) {
              allure.attachment(
                "error",
                `${entry.error.name}: ${entry.error.message}`,
                { contentType: "text/plain" },
              );
            }
          },
        },
      }),
    );

    await context.dispose();
  },
});
