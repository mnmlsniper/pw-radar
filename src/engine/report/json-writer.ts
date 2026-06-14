import { writeFileSync } from "node:fs";
import type { CoverageResults } from "../results.js";

export const DEFAULT_JSON_FILENAME = "pw-radar-results.json";

/** Writes the full results model as pretty JSON. */
export function writeJsonReport(
  results: CoverageResults,
  filename: string = DEFAULT_JSON_FILENAME,
): string {
  writeFileSync(filename, JSON.stringify(results, null, 2));
  return filename;
}
