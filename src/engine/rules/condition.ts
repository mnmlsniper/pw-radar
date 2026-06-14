import type { SpecOperation } from "../spec/model.js";
import type { CallView } from "./call-view.js";

/**
 * A single coverage condition attached to an operation. `covered` is sticky:
 * once a matching call satisfies it, it stays covered. Accumulating conditions
 * (enum coverage, declared-status) decide `covered` in {@link Condition.postCheck}.
 */
export interface Condition {
  /** Rule id this condition belongs to (its "type"). */
  readonly type: string;
  /** Human-readable label. */
  readonly name: string;
  /** Optional explanation, filled in during postCheck. */
  reason?: string;
  covered: boolean;
  /** Processes one call that matched the owning operation. */
  check(call: CallView): void;
  /** Finalizes coverage after all calls have been processed. */
  postCheck(): void;
}

/** A rule turns an operation into zero or more conditions. */
export interface ConditionRule {
  readonly id: string;
  createConditions(operation: SpecOperation): Condition[];
}

/** Condition that becomes covered as soon as one call satisfies a predicate. */
export function binaryCondition(
  type: string,
  name: string,
  predicate: (call: CallView) => boolean,
): Condition {
  return {
    type,
    name,
    covered: false,
    check(call: CallView): void {
      if (!this.covered && predicate(call)) this.covered = true;
    },
    postCheck(): void {
      /* nothing to finalize */
    },
  };
}

/** Condition that accumulates state across calls and decides coverage at the end. */
export function accumulatingCondition(
  type: string,
  name: string,
  onCall: (call: CallView) => void,
  finalize: () => { covered: boolean; reason?: string },
): Condition {
  return {
    type,
    name,
    covered: false,
    check(call: CallView): void {
      onCall(call);
    },
    postCheck(): void {
      const result = finalize();
      this.covered = result.covered;
      if (result.reason !== undefined) this.reason = result.reason;
    },
  };
}
