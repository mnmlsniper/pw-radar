/** Masking of sensitive values before they are written to disk. */

export const DEFAULT_SENSITIVE_KEYS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "api-key",
  "apikey",
  "access_token",
  "refresh_token",
];

export const DEFAULT_EXCLUDE_HEADERS = [
  "content-length",
  "host",
  "connection",
  "user-agent",
  "accept-encoding",
];

/** Partially masks a primitive value, keeping the first/last 2 chars for context. */
export function maskValue(value: unknown): string {
  if (typeof value === "string" && value.length > 4) {
    return value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2);
  }
  return "***";
}

function isSensitiveKey(key: string, sensitiveKeys: string[]): boolean {
  const lower = key.toLowerCase();
  return sensitiveKeys.some((s) => lower.includes(s.toLowerCase()));
}

/** Recursively masks values whose key matches a sensitive substring. */
export function maskDeep(input: unknown, sensitiveKeys: string[]): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => maskDeep(item, sensitiveKeys));
  }
  if (input !== null && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKey(key, sensitiveKeys)) {
        out[key] = maskValue(value);
      } else {
        out[key] = maskDeep(value, sensitiveKeys);
      }
    }
    return out;
  }
  return input;
}

/** Normalizes, filters and masks a header map. */
export function sanitizeHeaders(
  headers: Record<string, string> | undefined,
  sensitiveKeys: string[],
  excludeHeaders: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const exclude = new Set(excludeHeaders.map((h) => h.toLowerCase()));
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (exclude.has(lower)) continue;
    out[name] = isSensitiveKey(name, sensitiveKeys) ? maskValue(value) : value;
  }
  return out;
}
