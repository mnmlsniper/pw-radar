/** Console sink: adaptive, coloured, written to stderr. */

import { formatEntry } from "./format.js";
import type { LogLevel, SinkObject } from "./types.js";

function autoColor(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit;
  return process.stderr.isTTY === true && !process.env.NO_COLOR;
}

export function createConsoleSink(opts: {
  level: LogLevel;
  color?: boolean;
}): SinkObject {
  const color = autoColor(opts.color);
  return {
    write(entry): void {
      process.stderr.write(formatEntry(entry, { level: opts.level, color }) + "\n");
    },
  };
}
