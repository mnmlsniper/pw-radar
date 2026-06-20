/** Builds a copy-pasteable curl command from a (already masked) call. */

/** Single-quotes a value for POSIX shells, escaping embedded quotes. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): string {
  const parts = [`curl -X ${method.toUpperCase()}`, shellQuote(url)];
  for (const [name, value] of Object.entries(headers)) {
    parts.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  }
  if (body != null) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    parts.push(`-d ${shellQuote(data)}`);
  }
  return parts.join(" ");
}
