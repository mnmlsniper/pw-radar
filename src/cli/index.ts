#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadSpec } from "../engine/spec/load.js";
import { readCoverageDir } from "../engine/io/reader.js";
import { buildRules } from "../engine/rules/registry.js";
import { computeCoverage } from "../engine/coverage.js";
import { loadConfig } from "../engine/config.js";
import { DEFAULT_JSON_FILENAME, writeJsonReport } from "../engine/report/json-writer.js";
import { DEFAULT_HTML_FILENAME, writeHtmlReport } from "../engine/report/html-writer.js";
import { logSummary } from "../engine/report/log-writer.js";

const USAGE = `pw-radar — API coverage report from an OpenAPI/Swagger spec

Usage:
  pw-radar -s <spec> -i <input> [options]

Options:
  -s, --spec <path|url>   Path or URL to the OpenAPI/Swagger specification (required)
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
        spec: { type: "string", short: "s" },
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

  if (!values.spec || !values.input) {
    console.error("Both --spec and --input are required.\n");
    process.stdout.write(USAGE);
    return ExitCode.args;
  }

  const quiet = values.quiet === true;
  const verbose = values.verbose === true;

  try {
    const config = loadConfig(values.config);
    const rules = buildRules(config.rules);
    const headers = parseHeaders((values.header as string[]) ?? []);
    const spec = await loadSpec(values.spec, {
      ...(Object.keys(headers).length > 0 ? { httpHeaders: headers } : {}),
      validate: values.validate === true,
    });
    const input = readCoverageDir(values.input);

    if (verbose) input.warnings.forEach((w) => console.warn(w));

    const basePaths = [...config.basePaths, ...((values["base-path"] as string[]) ?? [])];
    const results = computeCoverage(spec, input.calls, rules, {
      excludeDeprecated: config.excludeDeprecated,
      basePaths,
    });
    results.generation.fileCount = input.fileCount;
    results.generation.specSource = values.spec;

    if (!quiet) logSummary(results);

    const jsonName = writeJsonReport(results, config.writers.json?.filename ?? DEFAULT_JSON_FILENAME);
    const localeChoice = values.locale ?? config.writers.html?.locale;
    const htmlName = writeHtmlReport(results, {
      filename: config.writers.html?.filename ?? DEFAULT_HTML_FILENAME,
      locale: localeChoice === "ru" ? "ru" : "en",
      theme: values.theme ?? config.writers.html?.theme,
      numberFormat: config.writers.html?.numberFormat,
    });

    if (!quiet) {
      console.log(`Read ${input.fileCount} coverage file(s), ${input.calls.length} call(s).`);
      console.log(`HTML report: ${htmlName}`);
      console.log(`JSON report: ${jsonName}`);
    }

    return ExitCode.ok;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return ExitCode.runtime;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
