import {
  COVERAGE_FORMAT_VERSION,
  type CoverageFile,
  type RecordedCall,
  type RecorderOptions,
} from "./types.js";
import { DEFAULT_EXCLUDE_HEADERS, DEFAULT_SENSITIVE_KEYS, maskDeep, sanitizeHeaders } from "./mask.js";
import { firstContentTypeToken, splitUrl } from "./normalize.js";
import { writeCoverageFile } from "./writer.js";

/** Raw, framework-agnostic input describing a single observed HTTP call. */
export interface RawCall {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  status: number;
  responseContentType?: string | null;
  responseBodyKeys?: string[];
}

export interface Recorder {
  /** Normalizes and buffers a raw call. */
  record(raw: RawCall): void;
  /** Number of buffered calls not yet flushed. */
  readonly size: number;
  /** Writes buffered calls to a file (if any) and clears the buffer. */
  flush(): string | null;
}

const DEFAULT_OUTPUT_DIR = "coverage-output";

/**
 * Creates an in-memory recorder. Calls are buffered and written as a single
 * {@link CoverageFile} on {@link Recorder.flush}. One recorder per test.
 */
export function createRecorder(options: RecorderOptions = {}): Recorder {
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const sensitiveKeys = options.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS;
  const excludeHeaders = options.excludeHeaders ?? DEFAULT_EXCLUDE_HEADERS;
  const includeRequestBody = options.includeRequestBody ?? true;

  let buffer: RecordedCall[] = [];

  return {
    record(raw: RawCall): void {
      const { path, query } = splitUrl(raw.url);
      const body =
        includeRequestBody && raw.requestBody != null
          ? maskDeep(raw.requestBody, sensitiveKeys)
          : null;

      buffer.push({
        method: raw.method.toUpperCase(),
        path,
        url: raw.url,
        query,
        requestHeaders: sanitizeHeaders(raw.requestHeaders, sensitiveKeys, excludeHeaders),
        requestBody: body,
        status: raw.status,
        responseContentType: firstContentTypeToken(raw.responseContentType),
        ...(raw.responseBodyKeys && raw.responseBodyKeys.length > 0
          ? { responseBodyKeys: raw.responseBodyKeys }
          : {}),
      });
    },

    get size(): number {
      return buffer.length;
    },

    flush(): string | null {
      if (buffer.length === 0) return null;
      const file: CoverageFile = {
        tool: "swagger-coverage-ts",
        formatVersion: COVERAGE_FORMAT_VERSION,
        recordedAt: new Date().toISOString(),
        ...(options.meta ? { meta: options.meta } : {}),
        calls: buffer,
      };
      const written = writeCoverageFile(outputDir, file);
      buffer = [];
      return written;
    },
  };
}
