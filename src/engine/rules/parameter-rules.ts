import type { SpecOperation, SpecParameter } from "../spec/model.js";
import {
  type Condition,
  type ConditionRule,
  accumulatingCondition,
  binaryCondition,
} from "./condition.js";

function enumStrings(param: SpecParameter): string[] {
  return (param.enum ?? []).map((v) => String(v));
}

/**
 * `parameter-not-empty`: per parameter, covered when the parameter was present
 * in at least one call.
 */
export class NotEmptyParameterRule implements ConditionRule {
  readonly id = "parameter-not-empty";

  createConditions(operation: SpecOperation): Condition[] {
    return operation.parameters.map((param) =>
      binaryCondition(
        this.id,
        { key: "cond.paramNotEmpty", params: { in: param.in, name: param.name } },
        (call) => call.hasParam(param.name, param.in),
      ),
    );
  }
}

/**
 * `empty-required-header`: per header parameter, covered when at least one call
 * was made without that header (the empty-header case was exercised).
 */
export class EmptyHeaderRule implements ConditionRule {
  readonly id = "empty-required-header";

  createConditions(operation: SpecOperation): Condition[] {
    return operation.parameters
      .filter((param) => param.in === "header")
      .map((param) =>
        binaryCondition(
          this.id,
          { key: "cond.headerEmpty", params: { name: param.name } },
          (call) => !call.hasParam(param.name, "header"),
        ),
      );
  }
}

/**
 * `enum-all-value`: per enum parameter, covered when every declared enum value
 * was observed across calls.
 */
export class EnumAllValuesRule implements ConditionRule {
  readonly id = "enum-all-value";

  createConditions(operation: SpecOperation): Condition[] {
    return operation.parameters
      .filter((param) => (param.enum?.length ?? 0) > 0)
      .map((param) => {
        const expected = enumStrings(param);
        const seen = new Set<string>();
        return accumulatingCondition(
          this.id,
          { key: "cond.paramEnumAll", params: { in: param.in, name: param.name, values: expected.join(", ") } },
          (call) => {
            for (const v of call.paramValues(param.name, param.in)) seen.add(v);
          },
          () => {
            const missed = expected.filter((v) => !seen.has(v));
            return missed.length === 0
              ? { covered: true }
              : { covered: false, reason: { key: "reason.missedValues", params: { values: missed.join(", ") } } };
          },
        );
      });
  }
}

/**
 * `enum-another-value`: per enum parameter, covered when a value *outside* the
 * declared enum was observed (negative testing).
 */
export class NotOnlyEnumValuesRule implements ConditionRule {
  readonly id = "enum-another-value";

  createConditions(operation: SpecOperation): Condition[] {
    return operation.parameters
      .filter((param) => (param.enum?.length ?? 0) > 0)
      .map((param) => {
        const expected = new Set(enumStrings(param));
        const seen = new Set<string>();
        return accumulatingCondition(
          this.id,
          { key: "cond.paramEnumAnother", params: { in: param.in, name: param.name } },
          (call) => {
            for (const v of call.paramValues(param.name, param.in)) seen.add(v);
          },
          () => {
            const extra = [...seen].filter((v) => !expected.has(v));
            return {
              covered: extra.length > 0,
              reason: { key: "reason.checkedValues", params: { values: [...seen].join(", ") } },
            };
          },
        );
      });
  }
}
