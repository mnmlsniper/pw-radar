/** The computed coverage result — the single model consumed by all writers. */

export type OperationCoverageState = "full" | "partial" | "empty" | "deprecated";

export interface ConditionResult {
  type: string;
  name: string;
  covered: boolean;
  reason?: string;
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
}

export interface CoverageResults {
  specTitle?: string;
  specVersion: string;
  generatedAt: string;
  generation: GenerationStats;
  operations: OperationCoverage[];
  missed: MissedCall[];
  summary: CoverageSummary;
  conditionStats: ConditionTypeStat[];
  tagStats: TagStat[];
}
