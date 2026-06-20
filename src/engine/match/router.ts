import type { ParsedSpec } from "../spec/model.js";
import { createPathMatcher, type PathMatcher } from "./path-matcher.js";

/** A spec the router can assign calls to. */
export interface RouterSpec {
  id: string;
  spec: ParsedSpec;
  /** Extra base-path prefixes (beyond those the spec declares). */
  basePaths: string[];
}

export interface SpecRouter {
  /**
   * Assigns a recorded call to exactly one spec id, or `null` when no spec
   * matches it. Used to build the aggregate report without double-counting a
   * call that several specs could each claim.
   */
  route(method: string, path: string): string | null;
}

interface Entry {
  id: string;
  matcher: PathMatcher;
  /** Spec's own base paths plus the extras, normalized, longest first. */
  basePaths: string[];
}

/** Length of the longest base path that prefixes `path` (0 if none / root). */
function basePathScore(basePaths: string[], path: string): number {
  let best = 0;
  for (const bp of basePaths) {
    if (path === bp || path.startsWith(bp + "/")) best = Math.max(best, bp.length);
  }
  return best;
}

/**
 * Routes calls across several specs. When more than one spec matches the same
 * path, the spec whose matched base path is **longest** wins; ties fall back to
 * **declaration order** (the spec listed first). This keeps a call counted once
 * in the aggregate even if specs share path templates.
 */
export function createRouter(specs: RouterSpec[]): SpecRouter {
  const entries: Entry[] = specs.map((s) => ({
    id: s.id,
    matcher: createPathMatcher(s.spec, s.basePaths),
    basePaths: [
      ...new Set([...s.spec.basePaths, ...s.basePaths.map((p) => p.replace(/\/+$/, ""))]),
    ].filter((p) => p.length > 0),
  }));

  return {
    route(method: string, path: string): string | null {
      let winner: string | null = null;
      let winnerScore = -1;
      for (const entry of entries) {
        if (!entry.matcher.match(method, path)) continue;
        const score = basePathScore(entry.basePaths, path);
        // Strictly-greater keeps the earliest spec on ties (declaration order).
        if (score > winnerScore) {
          winner = entry.id;
          winnerScore = score;
        }
      }
      return winner;
    },
  };
}
