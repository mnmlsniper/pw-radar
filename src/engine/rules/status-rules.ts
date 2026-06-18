import type { SpecOperation } from "../spec/model.js";
import { statusIsDeclared, statusMatches } from "../spec/status-match.js";
import {
  type Condition,
  type ConditionRule,
  accumulatingCondition,
  binaryCondition,
} from "./condition.js";

export interface StatusRuleOptions {
  /** Only consider these statuses (others ignored). */
  filter?: string[];
  /** Ignore these statuses. */
  ignore?: string[];
}

/**
 * `status`: one condition per declared response status, covered when a call
 * with that exact status was observed.
 */
export class HttpStatusRule implements ConditionRule {
  readonly id = "status";
  constructor(private readonly options: StatusRuleOptions = {}) {}

  private skip(status: string): boolean {
    const { filter, ignore } = this.options;
    if (filter && filter.length > 0 && !filter.includes(status)) return true;
    if (ignore && ignore.length > 0 && ignore.includes(status)) return true;
    return false;
  }

  createConditions(operation: SpecOperation): Condition[] {
    return operation.responseStatuses
      .filter((status) => !this.skip(status))
      .map((status) =>
        binaryCondition(this.id, { key: "cond.status", params: { status } }, (call) =>
          statusMatches(status, call.status),
        ),
      );
  }
}

/**
 * `only-declared-status`: a single condition that is covered when calls were
 * observed and every observed status is declared in the spec (no undeclared
 * statuses leaked through — a sign of missing documentation or server errors).
 */
export class OnlyDeclaredStatusRule implements ConditionRule {
  readonly id = "only-declared-status";

  createConditions(operation: SpecOperation): Condition[] {
    const declared = operation.responseStatuses;
    const observed = new Set<string>();
    return [
      accumulatingCondition(
        this.id,
        { key: "cond.onlyDeclaredStatus" },
        (call) => observed.add(call.status),
        () => {
          if (observed.size === 0) return { covered: false, reason: { key: "reason.noCalls" } };
          const undeclared = [...observed].filter((s) => !statusIsDeclared(declared, s));
          return undeclared.length === 0
            ? { covered: true }
            : { covered: false, reason: { key: "reason.undeclaredStatus", params: { values: undeclared.join(",") } } };
        },
      ),
    ];
  }
}

/**
 * `only-declared-response-field`: a single condition (only when the spec declares
 * response properties) covered when every field the server returned is declared.
 * Uncovered means the API returns fields the spec doesn't document.
 */
export class OnlyDeclaredResponseFieldRule implements ConditionRule {
  readonly id = "only-declared-response-field";

  createConditions(operation: SpecOperation): Condition[] {
    if (operation.responseProperties.length === 0) return [];
    const declared = new Set(operation.responseProperties);
    const observed = new Set<string>();
    return [
      accumulatingCondition(
        this.id,
        { key: "cond.onlyDeclaredResponseFields" },
        (call) => {
          for (const f of call.responseProps) observed.add(f);
        },
        () => {
          if (observed.size === 0) return { covered: false, reason: { key: "reason.noResponseFields" } };
          const undeclared = [...observed].filter((f) => !declared.has(f));
          return undeclared.length === 0
            ? { covered: true }
            : { covered: false, reason: { key: "reason.undeclaredFields", params: { values: undeclared.join(", ") } } };
        },
      ),
    ];
  }
}
