import type { ConditionRule } from "./condition.js";
import {
  HttpStatusRule,
  OnlyDeclaredResponseFieldRule,
  OnlyDeclaredStatusRule,
  type StatusRuleOptions,
} from "./status-rules.js";
import {
  EmptyHeaderRule,
  EnumAllValuesRule,
  NotEmptyParameterRule,
  NotOnlyEnumValuesRule,
} from "./parameter-rules.js";
import {
  NotEmptyBodyRule,
  PropertyEnumAllValuesRule,
  PropertyNotEmptyRule,
  PropertyNotOnlyEnumValuesRule,
} from "./body-rules.js";

/** Per-rule configuration, keyed by rule id. */
export interface RuleConfig {
  enable?: boolean;
  /** status rule only */
  filter?: string[];
  /** status rule only */
  ignore?: string[];
}

export interface RulesConfig {
  [ruleId: string]: RuleConfig;
}

/** All rule ids registered by default, in a stable order. */
export const DEFAULT_RULE_IDS = [
  "status",
  "only-declared-status",
  "only-declared-response-field",
  "parameter-not-empty",
  "enum-all-value",
  "enum-another-value",
  "empty-required-header",
  "not-empty-body",
  "property-not-empty",
  "property-enum-all-value",
  "property-enum-another-value",
] as const;

function instantiate(id: string, config: RuleConfig | undefined): ConditionRule | null {
  switch (id) {
    case "status": {
      const options: StatusRuleOptions = {};
      if (config?.filter) options.filter = config.filter;
      if (config?.ignore) options.ignore = config.ignore;
      return new HttpStatusRule(options);
    }
    case "only-declared-status":
      return new OnlyDeclaredStatusRule();
    case "only-declared-response-field":
      return new OnlyDeclaredResponseFieldRule();
    case "parameter-not-empty":
      return new NotEmptyParameterRule();
    case "enum-all-value":
      return new EnumAllValuesRule();
    case "enum-another-value":
      return new NotOnlyEnumValuesRule();
    case "empty-required-header":
      return new EmptyHeaderRule();
    case "not-empty-body":
      return new NotEmptyBodyRule();
    case "property-not-empty":
      return new PropertyNotEmptyRule();
    case "property-enum-all-value":
      return new PropertyEnumAllValuesRule();
    case "property-enum-another-value":
      return new PropertyNotOnlyEnumValuesRule();
    default:
      return null;
  }
}

/**
 * Builds the active rule set, applying per-rule enable/disable from config.
 * A rule is enabled unless its config explicitly sets `enable: false`.
 */
export function buildRules(config: RulesConfig = {}): ConditionRule[] {
  const rules: ConditionRule[] = [];
  for (const id of DEFAULT_RULE_IDS) {
    if (config[id]?.enable === false) continue;
    const rule = instantiate(id, config[id]);
    if (rule) rules.push(rule);
  }
  return rules;
}
