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
      binaryCondition(this.id, `${param.in} «${param.name}» is not empty`, (call) =>
        call.hasParam(param.name, param.in),
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
          `header «${param.name}» is empty`,
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
          `${param.in} «${param.name}» contains all values from enum [${expected.join(", ")}]`,
          (call) => {
            for (const v of call.paramValues(param.name, param.in)) seen.add(v);
          },
          () => {
            const missed = expected.filter((v) => !seen.has(v));
            return missed.length === 0
              ? { covered: true }
              : { covered: false, reason: `Missed values [${missed.join(", ")}]` };
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
          `${param.in} «${param.name}» contains values not only from enum`,
          (call) => {
            for (const v of call.paramValues(param.name, param.in)) seen.add(v);
          },
          () => {
            const extra = [...seen].filter((v) => !expected.has(v));
            return extra.length > 0
              ? { covered: true, reason: `Checked values: [${[...seen].join(", ")}]` }
              : { covered: false, reason: `Checked values: [${[...seen].join(", ")}]` };
          },
        );
      });
  }
}
