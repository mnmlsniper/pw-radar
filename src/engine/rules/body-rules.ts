import type { SpecBodyProperty, SpecOperation } from "../spec/model.js";
import {
  type Condition,
  type ConditionRule,
  accumulatingCondition,
  binaryCondition,
} from "./condition.js";

function enumStrings(prop: SpecBodyProperty): string[] {
  return (prop.enum ?? []).map((v) => String(v));
}

/** `not-empty-body`: covered when a call sent a non-empty request body. */
export class NotEmptyBodyRule implements ConditionRule {
  readonly id = "not-empty-body";

  createConditions(operation: SpecOperation): Condition[] {
    if (!operation.hasBody) return [];
    return [
      binaryCondition(this.id, "not empty body request", (call) => call.raw.requestBody != null),
    ];
  }
}

/** `property-not-empty`: per body property, covered when it was present in a call. */
export class PropertyNotEmptyRule implements ConditionRule {
  readonly id = "property-not-empty";

  createConditions(operation: SpecOperation): Condition[] {
    return operation.bodyProperties.map((prop) =>
      binaryCondition(this.id, `«${prop.name}» is not empty`, (call) => call.bodyProps.has(prop.name)),
    );
  }
}

/**
 * `property-enum-all-value`: per enum body property, covered when every declared
 * enum value was observed.
 *
 * Note: the original Java predicate for this rule id is swapped with the
 * "another value" one; we implement the semantics matching the rule name.
 */
export class PropertyEnumAllValuesRule implements ConditionRule {
  readonly id = "property-enum-all-value";

  createConditions(operation: SpecOperation): Condition[] {
    return operation.bodyProperties
      .filter((prop) => (prop.enum?.length ?? 0) > 0)
      .map((prop) => {
        const expected = enumStrings(prop);
        const seen = new Set<string>();
        return accumulatingCondition(
          this.id,
          `«${prop.name}» contains all values from enum [${expected.join(", ")}]`,
          (call) => {
            for (const v of call.bodyValues(prop.name)) seen.add(v);
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
 * `property-enum-another-value`: per enum body property, covered when a value
 * outside the declared enum was observed.
 */
export class PropertyNotOnlyEnumValuesRule implements ConditionRule {
  readonly id = "property-enum-another-value";

  createConditions(operation: SpecOperation): Condition[] {
    return operation.bodyProperties
      .filter((prop) => (prop.enum?.length ?? 0) > 0)
      .map((prop) => {
        const expected = new Set(enumStrings(prop));
        const seen = new Set<string>();
        return accumulatingCondition(
          this.id,
          `«${prop.name}» contains values not only from enum`,
          (call) => {
            for (const v of call.bodyValues(prop.name)) seen.add(v);
          },
          () => {
            const extra = [...seen].filter((v) => !expected.has(v));
            return { covered: extra.length > 0, reason: `Checked values: [${[...seen].join(", ")}]` };
          },
        );
      });
  }
}
