/**
 * Extracts a recordable request body from Playwright request options.
 * The goal is to keep property *values* (for enum coverage) while staying
 * JSON-serializable and safe.
 */

interface BodyCarryingOptions {
  data?: unknown;
  form?: Record<string, unknown>;
  multipart?: Record<string, unknown>;
}

/** Tries to parse a string as JSON, otherwise returns it untouched. */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Reduces multipart fields to plain values; file entries become a marker. */
function normalizeMultipart(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (value !== null && typeof value === "object") {
      // File payloads ({ name, mimeType, buffer }) — record presence only.
      out[name] = "[file]";
    } else {
      out[name] = value;
    }
  }
  return out;
}

/**
 * Returns the parsed request body, or null when there is none / it is binary.
 */
export function extractBody(options: unknown): unknown {
  if (!options || typeof options !== "object") return null;
  const opts = options as BodyCarryingOptions;

  if (opts.form && typeof opts.form === "object") {
    return { ...opts.form };
  }
  if (opts.multipart && typeof opts.multipart === "object") {
    return normalizeMultipart(opts.multipart);
  }

  const data = opts.data;
  if (data == null) return null;
  if (typeof data === "string") return tryParseJson(data);
  if (typeof data === "object") {
    // Buffer / typed array → binary, not useful for coverage.
    if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) return null;
    return data;
  }
  // number / boolean primitives
  return data;
}
