import { readFileSync } from "node:fs";
import type { RulesConfig } from "./rules/registry.js";

export interface WriterConfig {
  filename?: string;
  locale?: string;
  theme?: string;
  numberFormat?: string;
}

export interface Config {
  rules: RulesConfig;
  writers: {
    html?: WriterConfig;
    json?: WriterConfig;
  };
  excludeDeprecated: boolean;
  /** Base-path prefixes recorded paths carry but the spec omits. */
  basePaths: string[];
}

const DEFAULTS: Config = { rules: {}, writers: {}, excludeDeprecated: false, basePaths: [] };

function toBasePaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/**
 * Loads an optional JSON config. `exclude-deprecated` is read from the rules
 * section (as in the original) and also from a top-level flag.
 */
export function loadConfig(path?: string): Config {
  if (!path) return { ...DEFAULTS };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return { ...DEFAULTS };
  }

  const rules = (raw["rules"] as RulesConfig) ?? {};
  const excludeDeprecated =
    rules["exclude-deprecated"]?.enable === true || raw["excludeDeprecated"] === true;

  return {
    rules,
    writers: (raw["writers"] as Config["writers"]) ?? {},
    excludeDeprecated,
    basePaths: toBasePaths(raw["basePath"] ?? raw["basePaths"]),
  };
}
