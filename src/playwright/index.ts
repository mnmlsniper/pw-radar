import { AsyncLocalStorage } from "node:async_hooks";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { createRecorder, type Recorder } from "../recorder/recorder.js";
import { extractBody } from "../recorder/extract-body.js";
import type { RecorderOptions } from "../recorder/types.js";

/** HTTP verb methods on APIRequestContext we intercept. */
const VERB_METHODS = ["get", "post", "put", "patch", "delete", "head"] as const;

type AnyFn = (...args: unknown[]) => unknown;

function getHeaders(options: unknown): Record<string, string> | undefined {
  if (options && typeof options === "object" && "headers" in options) {
    return (options as { headers?: Record<string, string> }).headers;
  }
  return undefined;
}

function getMethod(options: unknown): string | undefined {
  if (options && typeof options === "object" && "method" in options) {
    return (options as { method?: string }).method;
  }
  return undefined;
}

/** Best-effort: top-level field names of a JSON response (names only, no values). */
async function responseKeys(response: APIResponse): Promise<string[] | undefined> {
  try {
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("json")) return undefined;
    const data: unknown = await response.json();
    if (Array.isArray(data)) {
      const first = data.find((x) => x !== null && typeof x === "object" && !Array.isArray(x));
      return first ? Object.keys(first as object) : undefined;
    }
    if (data !== null && typeof data === "object") return Object.keys(data as object);
    return undefined;
  } catch {
    return undefined;
  }
}

async function recordResponse(
  recorder: Recorder,
  method: string,
  response: APIResponse,
  options: unknown,
  captureResponseFields: boolean,
): Promise<void> {
  try {
    recorder.record({
      method,
      url: response.url(),
      requestHeaders: getHeaders(options),
      requestBody: extractBody(options),
      status: response.status(),
      responseContentType: response.headers()["content-type"] ?? null,
      responseBodyKeys: captureResponseFields ? await responseKeys(response) : undefined,
    });
  } catch {
    // Recording must never break the test under any circumstance.
  }
}

/**
 * Wraps a Playwright {@link APIRequestContext} so every request it makes is
 * recorded for coverage. Buffered calls are flushed to a per-test file when the
 * context is disposed, so an existing `await context.dispose()` is enough.
 *
 * Usage in a fixture:
 * ```ts
 * const context = await playwright.request.newContext({ baseURL });
 * await use(new Api({ request: recordContext(context) }));
 * await context.dispose();
 * ```
 */
export function recordContext(
  context: APIRequestContext,
  options: RecorderOptions = {},
): APIRequestContext {
  const workerIndex = process.env.TEST_WORKER_INDEX;
  const recorder = createRecorder({
    ...options,
    meta: {
      ...(workerIndex !== undefined ? { workerIndex: Number(workerIndex) } : {}),
      ...options.meta,
    },
  });

  const captureResponseFields = options.captureResponseFields ?? true;

  // Playwright's verb methods (get/post/...) delegate to fetch() internally, so
  // a call would be seen twice. This flag, scoped per async call chain, records
  // only the outermost interception — and being async-local, it stays correct
  // under concurrent requests.
  const inFlight = new AsyncLocalStorage<boolean>();

  // Loosely-typed view so we can swap methods without fighting overloads.
  const target = context as unknown as Record<string, AnyFn>;

  const wrap = (original: AnyFn, methodFor: (args: unknown[]) => string): AnyFn => {
    return async (...args: unknown[]): Promise<APIResponse> => {
      const nested = inFlight.getStore() === true;
      const exec = async (): Promise<APIResponse> => {
        const response = (await original.apply(context, args)) as APIResponse;
        if (!nested) {
          await recordResponse(recorder, methodFor(args), response, args[1], captureResponseFields);
        }
        return response;
      };
      return nested ? exec() : inFlight.run(true, exec);
    };
  };

  for (const verb of VERB_METHODS) {
    const original = target[verb];
    if (typeof original === "function") target[verb] = wrap(original, () => verb.toUpperCase());
  }

  // fetch(urlOrRequest, options) — method comes from options.method (default GET).
  const originalFetch = target.fetch;
  if (typeof originalFetch === "function") {
    target.fetch = wrap(originalFetch, (args) => (getMethod(args[1]) ?? "GET").toUpperCase());
  }

  // Flush buffered calls right before the context is disposed.
  const originalDispose = target.dispose;
  if (typeof originalDispose === "function") {
    target.dispose = async (...args: unknown[]): Promise<void> => {
      recorder.flush();
      await originalDispose.apply(context, args);
    };
  }

  return context;
}

export { createRecorder } from "../recorder/recorder.js";
export type { Recorder, RawCall } from "../recorder/recorder.js";
export type {
  RecorderOptions,
  RecordedCall,
  CoverageFile,
} from "../recorder/types.js";
