/** The computed coverage result — the single model consumed by all writers. */

export type OperationCoverageState = "full" | "partial" | "empty" | "deprecated";

export interface ConditionResult {
  type: string;
  /** Rendered English name (back-compat for JSON consumers). */
  name: string;
  /** Catalog key + params for localized rendering. */
  nameKey: string;
  nameParams?: Record<string, string>;
  covered: boolean;
  /** Rendered English reason (back-compat). */
  reason?: string;
  reasonKey?: string;
  reasonParams?: Record<string, string>;
}

export interface OperationCoverage {
  method: string;
  path: string;
  operationId?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  state: OperationCoverageState;
  /** Number of recorded calls that matched this operation. */
  processCount: number;
  conditionCount: number;
  coveredConditionCount: number;
  conditions: ConditionResult[];
}

export interface MissedCall {
  method: string;
  path: string;
  count: number;
}

export interface ConditionTypeStat {
  type: string;
  total: number;
  covered: number;
}

export interface TagStat {
  tag: string;
  full: number;
  partial: number;
  empty: number;
  total: number;
}

export interface CoverageSummary {
  full: number;
  partial: number;
  empty: number;
  deprecated: number;
  /** Operations counted toward percentages (excludes excluded-deprecated). */
  total: number;
  fullPercent: number;
  partialPercent: number;
  emptyPercent: number;
  conditionsCovered: number;
  conditionsTotal: number;
}

export interface GenerationStats {
  /** Number of recorded calls processed. */
  callCount: number;
  /** Number of coverage files read (set by the CLI). */
  fileCount?: number;
  /** Spec source path/URL (set by the CLI). */
  specSource?: string;
  /** All spec sources measured (aggregate report of a multi-spec run). */
  specSources?: string[];
}

export interface CoverageResults {
  specTitle?: string;
  /** Stable identifier of the spec (multi-spec runs); report file suffix. */
  specId?: string;
  specVersion: string;
  generatedAt: string;
  generation: GenerationStats;
  operations: OperationCoverage[];
  missed: MissedCall[];
  summary: CoverageSummary;
  conditionStats: ConditionTypeStat[];
  tagStats: TagStat[];
}

/**
 * Result of measuring several specs against one pool of calls.
 * `perSpec` computes each spec independently against ALL calls (an endpoint
 * shared by two specs counts in both). `aggregate` routes each call to a single
 * spec (longest base path, then declaration order) so the overall figures and
 * the global `missed` list never double-count.
 */
export interface MultiCoverageResults {
  aggregate: CoverageResults;
  perSpec: CoverageResults[];
}
