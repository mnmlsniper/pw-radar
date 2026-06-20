import { readFileSync } from "node:fs";
import type { RulesConfig } from "./rules/registry.js";

export interface WriterConfig {
  filename?: string;
  locale?: string;
  theme?: string;
  numberFormat?: string;
}

/** A single specification to measure, with its own optional base-path prefixes. */
export interface SpecEntry {
  /** Stable identifier (report file suffix / service label). */
  id?: string;
  /** Path or URL to the spec. */
  spec: string;
  /** Base-path prefixes this spec's recorded paths carry but the spec omits. */
  basePaths?: string[];
}

export interface Config {
  rules: RulesConfig;
  writers: {
    html?: WriterConfig;
    json?: WriterConfig;
  };
  excludeDeprecated: boolean;
  /** Global base-path prefixes recorded paths carry but specs omit. */
  basePaths: string[];
  /** Specs declared in the config file (CLI `-s` flags are merged on top). */
  specs: SpecEntry[];
}

const DEFAULTS: Config = { rules: {}, writers: {}, excludeDeprecated: false, basePaths: [], specs: [] };

function toBasePaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/**
 * Parses the optional `specs` array. Each entry is either a string (the spec
 * source) or an object `{ id?, spec, basePaths? }`. Malformed entries are
 * dropped rather than failing the whole load.
 */
function toSpecEntries(value: unknown): SpecEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: SpecEntry[] = [];
  for (const raw of value) {
    if (typeof raw === "string") {
      entries.push({ spec: raw });
      continue;
    }
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (typeof obj["spec"] !== "string") continue;
      entries.push({
        spec: obj["spec"],
        ...(typeof obj["id"] === "string" ? { id: obj["id"] } : {}),
        ...(obj["basePath"] !== undefined || obj["basePaths"] !== undefined
          ? { basePaths: toBasePaths(obj["basePaths"] ?? obj["basePath"]) }
          : {}),
      });
    }
  }
  return entries;
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
    specs: toSpecEntries(raw["specs"]),
  };
}

/** A spec entry with a guaranteed id and resolved base paths. */
export interface ResolvedSpec {
  id: string;
  spec: string;
  basePaths: string[];
}

/** Derives a default id from a spec path/URL: the file name without extension. */
function deriveId(source: string): string {
  const noQuery = source.split(/[?#]/)[0] ?? source;
  const segment = noQuery.replace(/\/+$/, "").split("/").pop() ?? source;
  return segment.replace(/\.(ya?ml|json)$/i, "") || "spec";
}

/**
 * Builds the final list of specs to measure from config `specs` plus repeated
 * CLI `-s` flags. Explicit ids must be unique (throws otherwise); auto-derived
 * ids collide-suffix (`name`, `name-2`, …). Each entry falls back to the global
 * base paths (config `basePath` + CLI `-b`) when it declares none of its own.
 */
export function resolveSpecs(config: Config, cliSpecs: string[], cliBasePaths: string[]): ResolvedSpec[] {
  const globalBasePaths = [...config.basePaths, ...cliBasePaths];
  const entries: SpecEntry[] = [...config.specs, ...cliSpecs.map((spec) => ({ spec }))];

  const explicit = new Set<string>();
  for (const entry of entries) {
    if (entry.id === undefined) continue;
    if (explicit.has(entry.id)) throw new Error(`Duplicate spec id: "${entry.id}"`);
    explicit.add(entry.id);
  }

  const used = new Set<string>(explicit);
  const resolved: ResolvedSpec[] = [];
  for (const entry of entries) {
    let id = entry.id ?? deriveId(entry.spec);
    if (entry.id === undefined && used.has(id)) {
      let n = 2;
      while (used.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    used.add(id);
    resolved.push({ id, spec: entry.spec, basePaths: entry.basePaths ?? globalBasePaths });
  }
  return resolved;
}
