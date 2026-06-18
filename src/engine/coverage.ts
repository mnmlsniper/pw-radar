import type { RecordedCall } from "../recorder/types.js";
import type { ParsedSpec, SpecOperation } from "./spec/model.js";
import { tm } from "./i18n.js";
import { createPathMatcher } from "./match/path-matcher.js";
import { buildCallView } from "./rules/call-view.js";
import type { Condition, ConditionRule } from "./rules/condition.js";
import {
  type ConditionResult,
  type ConditionTypeStat,
  type CoverageResults,
  type MissedCall,
  type OperationCoverage,
  type OperationCoverageState,
  type TagStat,
} from "./results.js";

export interface ComputeOptions {
  /** When true, deprecated operations are excluded from the statistics. */
  excludeDeprecated?: boolean;
  /**
   * Extra base-path prefixes carried by recorded paths but omitted by the spec
   * (e.g. "/api/v1" when the spec declares no servers).
   */
  basePaths?: string[];
}

interface OperationBucket {
  operation: SpecOperation;
  conditions: Condition[];
  processCount: number;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function classify(
  coveredCount: number,
  totalCount: number,
  deprecated: boolean,
  excludeDeprecated: boolean,
): OperationCoverageState {
  if (deprecated && excludeDeprecated) return "deprecated";
  if (coveredCount === 0) return "empty";
  return coveredCount === totalCount ? "full" : "partial";
}

/** Computes coverage of a parsed spec against recorded calls using the rules. */
export function computeCoverage(
  spec: ParsedSpec,
  calls: RecordedCall[],
  rules: ConditionRule[],
  options: ComputeOptions = {},
): CoverageResults {
  const excludeDeprecated = options.excludeDeprecated ?? false;

  // 1. Generate conditions for every operation.
  const buckets: OperationBucket[] = spec.operations.map((operation) => ({
    operation,
    conditions: rules.flatMap((rule) => rule.createConditions(operation)),
    processCount: 0,
  }));

  // 2. Route every recorded call to its operation.
  const matcher = createPathMatcher(spec, options.basePaths ?? []);
  const opToBucket = new Map<SpecOperation, OperationBucket>();
  for (const bucket of buckets) opToBucket.set(bucket.operation, bucket);

  const missedMap = new Map<string, MissedCall>();
  for (const call of calls) {
    const op = matcher.match(call.method, call.path);
    if (!op) {
      const key = `${call.method.toUpperCase()} ${call.path}`;
      const existing = missedMap.get(key);
      if (existing) existing.count += 1;
      else missedMap.set(key, { method: call.method.toUpperCase(), path: call.path, count: 1 });
      continue;
    }
    const bucket = opToBucket.get(op)!;
    bucket.processCount += 1;
    const view = buildCallView(call, op);
    for (const condition of bucket.conditions) condition.check(view);
  }

  // 3. Finalize and classify.
  const operations: OperationCoverage[] = [];
  for (const bucket of buckets) {
    for (const condition of bucket.conditions) condition.postCheck();
    const covered = bucket.conditions.filter((c) => c.covered).length;
    const state = classify(
      covered,
      bucket.conditions.length,
      bucket.operation.deprecated,
      excludeDeprecated,
    );
    operations.push(toOperationCoverage(bucket, covered, state));
  }

  return {
    specTitle: spec.title,
    specVersion: spec.version,
    generatedAt: new Date().toISOString(),
    generation: { callCount: calls.length },
    operations,
    missed: [...missedMap.values()].sort((a, b) =>
      `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
    ),
    summary: summarize(operations),
    conditionStats: conditionStatistics(operations),
    tagStats: tagStatistics(operations),
  };
}

function toOperationCoverage(
  bucket: OperationBucket,
  covered: number,
  state: OperationCoverageState,
): OperationCoverage {
  const conditions: ConditionResult[] = bucket.conditions.map((c) => ({
    type: c.type,
    name: tm("en", c.message),
    nameKey: c.message.key,
    ...(c.message.params ? { nameParams: c.message.params } : {}),
    covered: c.covered,
    ...(c.reason ? { reason: tm("en", c.reason), reasonKey: c.reason.key } : {}),
    ...(c.reason?.params ? { reasonParams: c.reason.params } : {}),
  }));
  const op = bucket.operation;
  return {
    method: op.method,
    path: op.path,
    ...(op.operationId !== undefined ? { operationId: op.operationId } : {}),
    ...(op.description !== undefined ? { description: op.description } : {}),
    tags: op.tags,
    deprecated: op.deprecated,
    state,
    processCount: bucket.processCount,
    conditionCount: bucket.conditions.length,
    coveredConditionCount: covered,
    conditions,
  };
}

function summarize(operations: OperationCoverage[]): CoverageResults["summary"] {
  let full = 0;
  let partial = 0;
  let empty = 0;
  let deprecated = 0;
  let conditionsCovered = 0;
  let conditionsTotal = 0;

  for (const op of operations) {
    switch (op.state) {
      case "full":
        full += 1;
        break;
      case "partial":
        partial += 1;
        break;
      case "empty":
        empty += 1;
        break;
      case "deprecated":
        deprecated += 1;
        continue; // excluded from condition totals too
    }
    conditionsCovered += op.coveredConditionCount;
    conditionsTotal += op.conditionCount;
  }

  const total = full + partial + empty;
  const pct = (n: number): number => (total === 0 ? 0 : round((n / total) * 100));

  return {
    full,
    partial,
    empty,
    deprecated,
    total,
    fullPercent: pct(full),
    partialPercent: pct(partial),
    emptyPercent: pct(empty),
    conditionsCovered,
    conditionsTotal,
  };
}

function conditionStatistics(operations: OperationCoverage[]): ConditionTypeStat[] {
  const byType = new Map<string, ConditionTypeStat>();
  for (const op of operations) {
    if (op.state === "deprecated") continue;
    for (const c of op.conditions) {
      const stat = byType.get(c.type) ?? { type: c.type, total: 0, covered: 0 };
      stat.total += 1;
      if (c.covered) stat.covered += 1;
      byType.set(c.type, stat);
    }
  }
  return [...byType.values()].sort((a, b) => a.type.localeCompare(b.type));
}

function tagStatistics(operations: OperationCoverage[]): TagStat[] {
  const byTag = new Map<string, TagStat>();
  const bump = (tag: string, state: OperationCoverageState): void => {
    const stat = byTag.get(tag) ?? { tag, full: 0, partial: 0, empty: 0, total: 0 };
    if (state === "full") stat.full += 1;
    else if (state === "partial") stat.partial += 1;
    else if (state === "empty") stat.empty += 1;
    stat.total += 1;
    byTag.set(tag, stat);
  };
  for (const op of operations) {
    if (op.state === "deprecated") continue;
    const tags = op.tags.length > 0 ? op.tags : ["default"];
    for (const tag of tags) bump(tag, op.state);
  }
  return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}
