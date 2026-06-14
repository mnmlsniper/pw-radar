import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecordedCall } from "../src/recorder/types.js";

/** Creates a unique temp directory. */
export function tmpDir(prefix = "swcov"): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

/** Builds a RecordedCall with sensible defaults. */
export function makeCall(
  partial: Partial<RecordedCall> & Pick<RecordedCall, "method" | "path" | "status">,
): RecordedCall {
  return {
    url: "http://example.test" + partial.path,
    query: {},
    requestHeaders: {},
    requestBody: null,
    responseContentType: "application/json",
    ...partial,
  };
}
