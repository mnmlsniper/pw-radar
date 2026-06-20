/** Shared rendering of a {@link LogEntry} into a human-readable block. */

import type { LogEntry, LogLevel } from "./types.js";

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function statusColor(status: number | null): string {
  if (status === null || status >= 500) return ANSI.red;
  if (status >= 400) return ANSI.yellow;
  if (status >= 300) return ANSI.cyan;
  return ANSI.green;
}

function paint(text: string, color: string, on: boolean): string {
  return on ? `${color}${text}${ANSI.reset}` : text;
}

function indent(text: string, pad = "    "): string {
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * Renders an entry. Successful calls collapse to one line unless `level` is
 * `verbose`; errors are always expanded with headers, bodies and curl.
 */
export function formatEntry(
  entry: LogEntry,
  opts: { level: LogLevel; color: boolean },
): string {
  const prefix = entry.workerIndex !== undefined ? `[w${entry.workerIndex}] ` : "";
  const mark = entry.ok ? "✓" : "✗";
  const statusText = entry.status === null ? "ERR" : String(entry.status);
  const color = statusColor(entry.status);
  const head =
    paint(`${prefix}${mark}`, color, opts.color) +
    ` ${entry.method} ${entry.url} ` +
    paint(`→ ${statusText}`, color, opts.color);

  const expanded = !entry.ok || opts.level === "verbose";
  if (!expanded) return head;

  const lines = [head];
  if (Object.keys(entry.requestHeaders).length > 0) {
    lines.push(indent(`headers: ${json(entry.requestHeaders)}`));
  }
  if (entry.requestBody != null) {
    lines.push(indent(`body: ${json(entry.requestBody)}`));
  }
  if (entry.responseBody !== undefined) {
    lines.push(indent(`response: ${json(entry.responseBody)}`));
  }
  if (entry.error) {
    lines.push(indent(paint(`error: ${entry.error.name}: ${entry.error.message}`, ANSI.red, opts.color)));
  }
  lines.push(indent(paint(`curl: ${entry.curl}`, ANSI.gray, opts.color)));
  return lines.join("\n");
}
