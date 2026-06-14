import type { ParsedSpec, SpecOperation } from "../spec/model.js";

/** Splits a path into non-empty segments, ignoring leading/trailing slashes. */
function segments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function isTemplateSegment(seg: string): boolean {
  return seg.startsWith("{") && seg.endsWith("}");
}

/**
 * Tests whether a templated path (`/products/{id}`) matches a concrete path
 * (`/products/123`). Template segments match any single non-empty segment;
 * static segments must be equal.
 */
export function matchPath(template: string, concrete: string): boolean {
  const t = segments(template);
  const c = segments(concrete);
  if (t.length !== c.length) return false;
  for (let i = 0; i < t.length; i++) {
    if (isTemplateSegment(t[i]!)) continue;
    if (t[i] !== c[i]) return false;
  }
  return true;
}

/** Higher = more specific (more static segments, fewer template params). */
function specificity(template: string): number {
  return segments(template).filter((s) => !isTemplateSegment(s)).length;
}

function stripPrefix(path: string, prefix: string): string | null {
  if (!prefix) return null;
  if (path === prefix) return "/";
  if (path.startsWith(prefix + "/")) return path.slice(prefix.length);
  return null;
}

export interface PathMatcher {
  /** Resolves a recorded (method, path) to the most specific spec operation. */
  match(method: string, path: string): SpecOperation | null;
}

/**
 * Builds a matcher over a parsed spec. Recorded paths may include a base path
 * prefix (e.g. `/api/v1`) that the spec omits; the matcher tries the path both
 * as-is and with each known base path stripped. `extraBasePaths` lets callers
 * supply prefixes the spec doesn't declare (no `servers`/`basePath`).
 */
export function createPathMatcher(spec: ParsedSpec, extraBasePaths: string[] = []): PathMatcher {
  const byMethod = new Map<string, SpecOperation[]>();
  for (const op of spec.operations) {
    const list = byMethod.get(op.method) ?? [];
    list.push(op);
    byMethod.set(op.method, list);
  }

  const basePaths = [
    ...new Set([...spec.basePaths, ...extraBasePaths.map((p) => p.replace(/\/+$/, ""))]),
  ].filter((p) => p.length > 0);

  return {
    match(method: string, path: string): SpecOperation | null {
      const candidates = byMethod.get(method.toUpperCase());
      if (!candidates) return null;

      const concretePaths = [path];
      for (const bp of basePaths) {
        const stripped = stripPrefix(path, bp);
        if (stripped !== null) concretePaths.push(stripped);
      }

      let best: SpecOperation | null = null;
      let bestScore = -1;
      for (const op of candidates) {
        const hit = concretePaths.some((cp) => matchPath(op.path, cp));
        if (!hit) continue;
        const score = specificity(op.path);
        if (score > bestScore) {
          best = op;
          bestScore = score;
        }
      }
      return best;
    },
  };
}
