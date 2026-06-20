/**
 * The logger orchestrates: normalize options → build a masked {@link LogEntry}
 * → filter → dispatch to sinks. It is framework-agnostic; the Playwright layer
 * feeds it raw calls (including thrown requests) and calls {@link Logger.flush}
 * when the test's context is disposed.
 */

import { maskDeep, sanitizeHeaders } from "../mask.js";
import { splitUrl } from "../normalize.js";
import { buildCurl } from "./curl.js";
import { createConsoleSink } from "./console-sink.js";
import { createFileSink } from "./file-sink.js";
import type {
  LogConfig,
  LogEntry,
  LogLevel,
  LogOptions,
  SinkObject,
  SinkSpec,
} from "./types.js";

/** Raw, framework-agnostic input for a single observed (or failed) call. */
export interface RawLogCall {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  /** Omitted when the request threw before producing a response. */
  status?: number;
  responseContentType?: string | null;
  responseBody?: unknown;
  error?: unknown;
}

export interface Logger {
  /** Whether the response body should be fetched for the given status. */
  needsResponseBody(status: number): boolean;
  log(raw: RawLogCall): void;
  flush(): void;
}

/** Context shared from the recorder (masking policy + per-test metadata). */
export interface LoggerContext {
  sensitiveKeys: string[];
  excludeHeaders: string[];
  meta?: { workerIndex?: number; title?: string };
}

function normalize(log: LogConfig | undefined): LogOptions | null {
  if (log === undefined || log === false) return null;
  if (log === true) return {};
  if (log === "summary" || log === "verbose") return { level: log };
  return log;
}

let warned = false;
function warnMaskForced(): void {
  if (warned) return;
  warned = true;
  process.stderr.write(
    "swagger-coverage-ts: log.mask:false ignored because a file sink is configured (files leak into CI artifacts).\n",
  );
}

function dropExcluded(
  headers: Record<string, string> | undefined,
  excludeHeaders: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const exclude = new Set(excludeHeaders.map((h) => h.toLowerCase()));
  for (const [name, value] of Object.entries(headers)) {
    if (!exclude.has(name.toLowerCase())) out[name] = value;
  }
  return out;
}

function toErrorInfo(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: "Error", message: String(err) };
}

function resolveSink(spec: SinkSpec, opts: LogOptions, ctx: LoggerContext): SinkObject {
  if (spec === "console") {
    return createConsoleSink({ level: opts.level ?? "summary", color: opts.color });
  }
  if (spec === "file") {
    return createFileSink({ fileFormat: opts.fileFormat, logDir: opts.logDir, meta: ctx.meta });
  }
  if (typeof spec === "function") return { write: spec };
  return spec;
}

/** Creates a logger, or null when logging is disabled. */
export function createLogger(log: LogConfig | undefined, ctx: LoggerContext): Logger | null {
  const opts = normalize(log);
  if (!opts) return null;

  const specs: SinkSpec[] = Array.isArray(opts.sink) ? opts.sink : [opts.sink ?? "console"];
  const hasFile = specs.includes("file");

  let mask = opts.mask ?? true;
  if (!mask && hasFile) {
    warnMaskForced();
    mask = true;
  }

  const level: LogLevel = opts.level ?? "summary";
  const onlyErrors = opts.onlyErrors ?? false;
  const sensitiveKeys = [...ctx.sensitiveKeys, ...(opts.maskKeys ?? [])];
  const excludeHeaders = ctx.excludeHeaders;
  const sinks = specs.map((spec) => resolveSink(spec, opts, ctx));

  function build(raw: RawLogCall): LogEntry {
    const { path } = splitUrl(raw.url);
    const method = raw.method.toUpperCase();
    const headers = mask
      ? sanitizeHeaders(raw.requestHeaders, sensitiveKeys, excludeHeaders)
      : dropExcluded(raw.requestHeaders, excludeHeaders);
    const requestBody =
      raw.requestBody == null ? null : mask ? maskDeep(raw.requestBody, sensitiveKeys) : raw.requestBody;
    const responseBody =
      raw.responseBody === undefined
        ? undefined
        : mask
          ? maskDeep(raw.responseBody, sensitiveKeys)
          : raw.responseBody;
    const status = raw.status ?? null;
    const ok = status !== null && status < 400 && !raw.error;

    return {
      method,
      url: raw.url,
      path,
      status,
      ok,
      requestHeaders: headers,
      requestBody,
      curl: buildCurl(method, raw.url, headers, requestBody),
      ...(responseBody !== undefined ? { responseBody } : {}),
      ...(raw.responseContentType != null ? { responseContentType: raw.responseContentType } : {}),
      ...(raw.error ? { error: toErrorInfo(raw.error) } : {}),
      ...(ctx.meta?.workerIndex !== undefined ? { workerIndex: ctx.meta.workerIndex } : {}),
    };
  }

  return {
    needsResponseBody(status: number): boolean {
      return level === "verbose" || status >= 400;
    },
    log(raw: RawLogCall): void {
      const status = raw.status ?? null;
      const ok = status !== null && status < 400 && !raw.error;
      if (onlyErrors && ok) return;
      const entry = build(raw);
      for (const sink of sinks) sink.write(entry);
    },
    flush(): void {
      for (const sink of sinks) sink.flush?.();
    },
  };
}
