import type { CoverageResults, MultiCoverageResults } from "../results.js";

/** Prints a concise coverage summary to the console (like the original CLI). */
export function logSummary(results: CoverageResults, log: (line: string) => void = console.log): void {
  const { summary, operations, missed } = results;

  const byState = (state: string): string[] =>
    operations
      .filter((o) => o.state === state)
      .map((o) => `    ${o.method} ${o.path}`);

  const logAll = (lines: string[]): void => lines.forEach((line) => log(line));

  log("Empty coverage:");
  logAll(byState("empty"));
  log("Partial coverage:");
  logAll(byState("partial"));
  log("Full coverage:");
  logAll(byState("full"));

  if (missed.length > 0) {
    log(`Missed calls (not found in spec): ${missed.length}`);
    missed.forEach((m) => log(`    ${m.method} ${m.path} (x${m.count})`));
  }

  log(`Conditions: ${summary.conditionsCovered}/${summary.conditionsTotal}`);
  log(`Empty coverage   ${summary.emptyPercent} %`);
  log(`Partial coverage ${summary.partialPercent} %`);
  log(`Full coverage    ${summary.fullPercent} %`);
}

/** Prints one summary block per spec, then the routed aggregate. */
export function logMultiSummary(
  multi: MultiCoverageResults,
  log: (line: string) => void = console.log,
): void {
  for (const spec of multi.perSpec) {
    log(`=== ${spec.specId ?? "spec"}${spec.specTitle ? ` — ${spec.specTitle}` : ""} ===`);
    logSummary(spec, log);
    log("");
  }
  log("=== Aggregate (routed) ===");
  logSummary(multi.aggregate, log);
}
