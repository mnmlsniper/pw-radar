import type { RecordedCall } from "../../recorder/types.js";
import type { ParameterLocation, SpecOperation } from "../spec/model.js";

/**
 * A per-(call, operation) view that answers the questions rules ask: which
 * parameters were present, with what values, which body properties were sent,
 * and the response status. Path-parameter values are recovered by aligning the
 * operation template with the concrete recorded path.
 */
export interface CallView {
  readonly status: string;
  hasParam(name: string, location: ParameterLocation): boolean;
  paramValues(name: string, location: ParameterLocation): string[];
  /** All present body property paths, including nested ones ("address.city"). */
  readonly bodyProps: ReadonlySet<string>;
  /** All values observed at a (possibly nested) body path, as strings. */
  bodyValues(name: string): string[];
  /** Top-level field names observed in the JSON response (names only). */
  readonly responseProps: ReadonlySet<string>;
  readonly raw: RecordedCall;
}

const MAX_BODY_DEPTH = 6;

/** Walks a recorded body into a map of dotted path → observed values. */
function walkBody(value: unknown, prefix: string, depth: number, out: Map<string, unknown[]>): void {
  if (depth > MAX_BODY_DEPTH) return;
  if (Array.isArray(value)) {
    for (const el of value) walkBody(el, prefix, depth, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      const dotted = prefix ? `${prefix}.${key}` : key;
      const bucket = out.get(dotted) ?? [];
      bucket.push(val);
      out.set(dotted, bucket);
      walkBody(val, dotted, depth + 1, out);
    }
  }
}

function segments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function isTemplateSeg(seg: string): boolean {
  return seg.startsWith("{") && seg.endsWith("}");
}

export function buildCallView(call: RecordedCall, operation: SpecOperation): CallView {
  const headers = new Map<string, string>();
  for (const [k, v] of Object.entries(call.requestHeaders)) headers.set(k.toLowerCase(), v);

  // Align template tail with concrete path to recover path-parameter values.
  const tSegs = segments(operation.path);
  const cSegs = segments(call.path);
  const pathParams = new Map<string, string>();
  if (cSegs.length >= tSegs.length) {
    const offset = cSegs.length - tSegs.length;
    for (let i = 0; i < tSegs.length; i++) {
      const t = tSegs[i]!;
      if (isTemplateSeg(t)) pathParams.set(t.slice(1, -1), cSegs[offset + i]!);
    }
  }

  const bodyMap = new Map<string, unknown[]>();
  walkBody(call.requestBody, "", 0, bodyMap);
  const bodyProps = new Set<string>(bodyMap.keys());
  const responseProps = new Set<string>(call.responseBodyKeys ?? []);

  return {
    status: String(call.status),
    raw: call,
    bodyProps,
    responseProps,
    bodyValues(name: string): string[] {
      return (bodyMap.get(name) ?? []).map((v) => String(v));
    },
    hasParam(name: string, location: ParameterLocation): boolean {
      switch (location) {
        case "query":
          return Object.prototype.hasOwnProperty.call(call.query, name);
        case "header":
          return headers.has(name.toLowerCase());
        case "path":
          return pathParams.has(name);
        case "cookie":
          return false;
      }
    },
    paramValues(name: string, location: ParameterLocation): string[] {
      switch (location) {
        case "query": {
          const v = call.query[name];
          if (v === undefined) return [];
          return Array.isArray(v) ? v.map(String) : [String(v)];
        }
        case "header": {
          const v = headers.get(name.toLowerCase());
          return v === undefined ? [] : [v];
        }
        case "path": {
          const v = pathParams.get(name);
          return v === undefined ? [] : [v];
        }
        case "cookie":
          return [];
      }
    },
  };
}
