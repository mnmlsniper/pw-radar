import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CoverageFile } from "./types.js";

/** Builds a filesystem-safe slug from a request path. */
function slugify(method: string, path: string): string {
  const base = `${method}-${path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, 80) || "call";
}

/**
 * Writes one {@link CoverageFile} into the output directory under a unique
 * filename. Unique per call → safe across parallel Playwright workers.
 */
export function writeCoverageFile(outputDir: string, file: CoverageFile): string {
  mkdirSync(outputDir, { recursive: true });
  const first = file.calls[0];
  const hint = first ? slugify(first.method, first.path) : "calls";
  const filename = `${hint}-${randomUUID()}.json`;
  const fullPath = join(outputDir, filename);
  writeFileSync(fullPath, JSON.stringify(file, null, 2));
  return fullPath;
}
