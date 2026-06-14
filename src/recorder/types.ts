/**
 * Normalized intermediate format shared between the recorder (collection) and
 * the report engine. This is the only contract between the two halves of the
 * tool — the recorder never knows about the spec, the engine never knows about
 * Playwright.
 *
 * One file per test is written to the output directory; each file is a single
 * {@link CoverageFile}. The engine globs the directory and merges all calls.
 */

export const COVERAGE_FORMAT_VERSION = 1;

/** A single observed HTTP call. */
export interface RecordedCall {
  /** Upper-case HTTP method, e.g. "GET". */
  method: string;
  /**
   * Concrete request path with the leading slash, no query string,
   * e.g. "/api/v1/products/123". The engine matches this against the
   * templated paths from the spec ("/products/{id}").
   */
  path: string;
  /** Full request URL as observed (after redirects), for debugging. */
  url: string;
  /** Query parameters as name -> value(s). */
  query: Record<string, string | string[]>;
  /** Request header names -> value. Used for header-parameter coverage. */
  requestHeaders: Record<string, string>;
  /**
   * Parsed request body when it is a JSON object, otherwise null.
   * Property values are kept so the engine can compute enum coverage.
   */
  requestBody: unknown;
  /** Response HTTP status code. */
  status: number;
  /** Response content-type (first token, without parameters), if known. */
  responseContentType: string | null;
  /**
   * Top-level property names of the JSON response body (names only, no values).
   * Used to detect undeclared fields the server returns. Omitted when the
   * response isn't a JSON object/array of objects or capture is disabled.
   */
  responseBodyKeys?: string[];
}

/** One output file = all calls recorded during a single test. */
export interface CoverageFile {
  tool: "swagger-coverage-ts";
  formatVersion: typeof COVERAGE_FORMAT_VERSION;
  recordedAt: string;
  /** Optional metadata to aid debugging / sharding. */
  meta?: {
    workerIndex?: number;
    title?: string;
  };
  calls: RecordedCall[];
}

/** Options accepted by the recorder. */
export interface RecorderOptions {
  /** Directory to write per-test files into. Default: "coverage-output". */
  outputDir?: string;
  /**
   * Header/property names (case-insensitive substring match) whose values are
   * masked before being written. Default covers common secrets.
   */
  sensitiveKeys?: string[];
  /**
   * Header names (lower-case) to drop entirely from the record. Default drops
   * volatile/noise headers (content-length, host, ...).
   */
  excludeHeaders?: string[];
  /** When false, request bodies are not recorded. Default true. */
  includeRequestBody?: boolean;
  /**
   * When true (default), capture top-level response field *names* (no values) so
   * the report can flag undeclared fields the server returns.
   */
  captureResponseFields?: boolean;
  /** Optional metadata written into the file. */
  meta?: CoverageFile["meta"];
}
