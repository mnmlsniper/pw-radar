/** URL / content-type normalization helpers shared by the recorder. */

export interface SplitUrl {
  path: string;
  query: Record<string, string | string[]>;
}

/**
 * Splits a request URL into a clean path (with leading slash, no query) and a
 * query map. Falls back gracefully for non-absolute URLs.
 */
export function splitUrl(rawUrl: string): SplitUrl {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Relative URL: try against a dummy base so we still get path + query.
    try {
      url = new URL(rawUrl, "http://localhost");
    } catch {
      return { path: rawUrl, query: {} };
    }
  }

  const query: Record<string, string | string[]> = {};
  for (const key of url.searchParams.keys()) {
    if (key in query) continue;
    const all = url.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0];
  }

  return { path: url.pathname || "/", query };
}

/** Returns the first token of a content-type header, lower-cased, or null. */
export function firstContentTypeToken(
  contentType: string | undefined | null,
): string | null {
  if (!contentType) return null;
  const token = contentType.split(";")[0]?.trim().toLowerCase();
  return token ? token : null;
}
