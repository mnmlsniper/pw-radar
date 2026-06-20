#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadSpec, loadSpecs } from "../engine/spec/load.js";
import { readCoverageDir } from "../engine/io/reader.js";
import { buildRules } from "../engine/rules/registry.js";
import { computeCoverage, computeMultiCoverage } from "../engine/coverage.js";
import { loadConfig, resolveSpecs } from "../engine/config.js";
import {
  DEFAULT_JSON_FILENAME,
  writeJsonReport,
  writeMultiJsonReport,
} from "../engine/report/json-writer.js";
import {
  DEFAULT_HTML_FILENAME,
  writeHtmlReport,
  writeMultiHtmlReport,
} from "../engine/report/html-writer.js";
import { logSummary, logMultiSummary } from "../engine/report/log-writer.js";

const USAGE = `pw-radar — API coverage report from an OpenAPI/Swagger spec

Usage:
  pw-radar -s <spec> -i <input> [options]

Options:
  -s, --spec <path|url>   Path or URL to an OpenAPI/Swagger spec (required).
                          Repeatable — pass several to measure multiple specs
                          (or declare them as "specs" in the config file).
  -i, --input <dir>       Directory with recorded coverage files (required)
  -c, --config <path>     Path to a JSON configuration file
  -b, --base-path <p>     Base-path prefix recorded paths carry but the spec
                          omits (e.g. /api/v1). Repeatable.
  -H, --header "K: V"     HTTP header for fetching a remote spec. Repeatable.
  -l, --locale <en|ru>    Initial report language (all languages are embedded;
                          a switcher is available inside the HTML).
      --theme <name>      Initial report theme: tech (default), terminal,
                          monochrome, cyber. All themes are embedded.
      --validate          Validate the spec (fail on invalid) instead of parse.
  -q, --quiet             Suppress console summary
  -v, --verbose           Print extra diagnostics (warnings)
  -h, --help              Show this help
`;

const ExitCode = { ok: 0, args: 1, runtime: 2 } as const;

/** Parses `"Name: Value"` header strings into a map. */
function parseHeaders(raw: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of raw) {
    const idx = entry.indexOf(":");
    if (idx === -1) continue;
    const name = entry.slice(0, idx).trim();
    const value = entry.slice(idx + 1).trim();
    if (name) headers[name] = value;
  }
  return headers;
}

async function main(argv: string[]): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        spec: { type: "string", short: "s", multiple: true },
        input: { type: "string", short: "i" },
        config: { type: "string", short: "c" },
        "base-path": { type: "string", short: "b", multiple: true },
        header: { type: "string", short: "H", multiple: true },
        locale: { type: "string", short: "l" },
        theme: { type: "string" },
        validate: { type: "boolean" },
        quiet: { type: "boolean", short: "q" },
        verbose: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    console.error((err as Error).message);
    process.stdout.write(USAGE);
    return ExitCode.args;
  }

  if (values.help) {
    process.stdout.write(USAGE);
    return ExitCode.ok;
  }

  if (!values.input) {
    console.error("--input is required.\n");
    process.stdout.write(USAGE);
    return ExitCode.args;
  }

  const quiet = values.quiet === true;
  const verbose = values.verbose === true;

  try {
    const config = loadConfig(values.config);
    const rules = buildRules(config.rules);
    const headers = parseHeaders((values.header as string[]) ?? []);
    const cliSpecs = (values.spec as string[]) ?? [];
    const cliBasePaths = (values["base-path"] as string[]) ?? [];
    const resolved = resolveSpecs(config, cliSpecs, cliBasePaths);

    if (resolved.length === 0) {
      console.error('Provide at least one spec via --spec or "specs" in the config.\n');
      process.stdout.write(USAGE);
      return ExitCode.args;
    }

    const input = readCoverageDir(values.input);
    if (verbose) input.warnings.forEach((w) => console.warn(w));

    const loadOpts = {
      ...(Object.keys(headers).length > 0 ? { httpHeaders: headers } : {}),
      validate: values.validate === true,
    };
    const localeChoice = values.locale ?? config.writers.html?.locale;
    const htmlOptions = {
      filename: config.writers.html?.filename ?? DEFAULT_HTML_FILENAME,
      locale: (localeChoice === "ru" ? "ru" : "en") as "en" | "ru",
      theme: values.theme ?? config.writers.html?.theme,
      numberFormat: config.writers.html?.numberFormat,
    };
    const jsonFilename = config.writers.json?.filename ?? DEFAULT_JSON_FILENAME;

    // Single spec: identical behavior to before (backward compatible).
    if (resolved.length === 1) {
      const entry = resolved[0]!;
      const spec = await loadSpec(entry.spec, loadOpts);
      const results = computeCoverage(spec, input.calls, rules, {
        excludeDeprecated: config.excludeDeprecated,
        basePaths: entry.basePaths,
      });
      results.generation.fileCount = input.fileCount;
      results.generation.specSource = entry.spec;

      if (!quiet) logSummary(results);
      const jsonName = writeJsonReport(results, jsonFilename);
      const htmlName = writeHtmlReport(results, htmlOptions);
      if (!quiet) {
        console.log(`Read ${input.fileCount} coverage file(s), ${input.calls.length} call(s).`);
        console.log(`HTML report: ${htmlName}`);
        console.log(`JSON report: ${jsonName}`);
      }
      return ExitCode.ok;
    }

    // Multiple specs: per-spec reports + a routed aggregate.
    const loaded = await loadSpecs(resolved, loadOpts);
    const multi = computeMultiCoverage(loaded, input.calls, rules, {
      excludeDeprecated: config.excludeDeprecated,
    });
    multi.aggregate.generation.fileCount = input.fileCount;
    multi.aggregate.generation.specSources = resolved.map((r) => `${r.spec} (${r.id})`);
    for (const spec of multi.perSpec) {
      spec.generation.fileCount = input.fileCount;
      const source = resolved.find((r) => r.id === spec.specId);
      if (source) spec.generation.specSource = source.spec;
    }

    if (!quiet) logMultiSummary(multi);
    const jsonName = writeMultiJsonReport(multi, jsonFilename);
    const htmlNames = writeMultiHtmlReport(multi, htmlOptions);
    if (!quiet) {
      console.log(
        `Read ${input.fileCount} coverage file(s), ${input.calls.length} call(s) across ${loaded.length} specs.`,
      );
      console.log(`HTML reports: ${htmlNames.join(", ")}`);
      console.log(`JSON report: ${jsonName}`);
    }
    return ExitCode.ok;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return ExitCode.runtime;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
