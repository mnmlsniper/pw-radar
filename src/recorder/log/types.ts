/**
 * Request/response debug logger types. The logger is layered on top of the same
 * interception point that feeds coverage recording — it never duplicates the
 * intercept. Output is decoupled from formatting through {@link Sink}s.
 */

export type LogLevel = "summary" | "verbose";

/**
 * A normalized, ready-to-render record of a single HTTP call. Values are already
 * masked according to the active masking policy (see {@link LogOptions.mask}).
 * Custom sinks receive this object as-is.
 */
export interface LogEntry {
  /** Upper-case HTTP method. */
  method: string;
  /** Full request URL as observed. */
  url: string;
  /** Request path (leading slash, no query). */
  path: string;
  /** Response status, or null when the request threw before a response. */
  status: number | null;
  /** True for a completed 1xx–3xx response with no thrown error. */
  ok: boolean;
  /** Masked, noise-filtered request headers. */
  requestHeaders: Record<string, string>;
  /** Masked request body, or null. */
  requestBody: unknown;
  /** Masked response body. Present only when captured (verbose or error). */
  responseBody?: unknown;
  /** Response content-type (first token), if known. */
  responseContentType?: string | null;
  /** Set when the request threw (timeout, connection refused, ...). */
  error?: { name: string; message: string };
  /** Copy-pasteable curl reproduction (uses masked headers/body). */
  curl: string;
  /** Playwright worker index, for de-interleaving parallel output. */
  workerIndex?: number;
}

/** A sink as a plain function (shorthand) or an object with optional flush. */
export type Sink = SinkFn | SinkObject;
export type SinkFn = (entry: LogEntry) => void;
export interface SinkObject {
  write(entry: LogEntry): void;
  /** Called once when the owning test's context is disposed. */
  flush?(): void;
}

/** Where to send log output: a built-in target name or a custom sink. */
export type SinkSpec = "console" | "file" | Sink;

/** Full logger configuration. */
export interface LogOptions {
  /**
   * Detail threshold (not all-short/all-long): `summary` (default) renders
   * successful calls compact and errors expanded; `verbose` expands everything.
   */
  level?: LogLevel;
  /** When true, only non-2xx/3xx and thrown requests are logged. Default false. */
  onlyErrors?: boolean;
  /** Output target(s). Default `'console'`. */
  sink?: SinkSpec | SinkSpec[];
  /**
   * Mask sensitive headers/body values. Default true. Forced to true whenever a
   * `'file'` sink is present (files leak into CI artifacts) — cannot be disabled
   * there. Disable only for a console-only run when you need live values.
   */
  mask?: boolean;
  /** Extra key substrings to mask, in addition to the recorder's sensitiveKeys. */
  maskKeys?: string[];
  /** Force-enable/disable ANSI colour on the console sink. Default: TTY autodetect. */
  color?: boolean;
  /** File-sink serialization. Default `'pretty'`. */
  fileFormat?: "pretty" | "jsonl";
  /** Directory for the file sink. Default `'logs'`. */
  logDir?: string;
}

/** Accepted shorthands for the `log` option. */
export type LogConfig = boolean | LogLevel | LogOptions;
