import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COVERAGE_FORMAT_VERSION,
  type CoverageFile,
  type RecordedCall,
} from "../../recorder/types.js";

export interface ReadResult {
  /** All recorded calls merged from every file in the directory. */
  calls: RecordedCall[];
  /** Number of coverage files successfully read. */
  fileCount: number;
  /** Non-fatal problems encountered (bad/unknown files). */
  warnings: string[];
}

/** Recursively collects every `.json` file under a directory. */
function findJsonFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new Error(`Coverage input directory not found: ${dir}`);
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

function isCoverageFile(value: unknown): value is CoverageFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as CoverageFile).tool === "swagger-coverage-ts" &&
    Array.isArray((value as CoverageFile).calls)
  );
}

/**
 * Reads and merges all coverage files written by the recorder. Files from
 * different parallel workers live side by side and are simply concatenated.
 * Unknown or malformed files are skipped with a warning rather than failing.
 */
export function readCoverageDir(dir: string): ReadResult {
  const files = findJsonFiles(dir);
  const calls: RecordedCall[] = [];
  const warnings: string[] = [];
  let fileCount = 0;

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      warnings.push(`Skipped unreadable JSON: ${file}`);
      continue;
    }

    if (!isCoverageFile(parsed)) {
      warnings.push(`Skipped file in unknown format: ${file}`);
      continue;
    }

    if (parsed.formatVersion !== COVERAGE_FORMAT_VERSION) {
      warnings.push(
        `Skipped file with unsupported formatVersion ${String(parsed.formatVersion)}: ${file}`,
      );
      continue;
    }

    calls.push(...parsed.calls);
    fileCount += 1;
  }

  return { calls, fileCount, warnings };
}
