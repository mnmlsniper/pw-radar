/**
 * File sink: buffers entries and writes one file per test on flush. The filename
 * carries the worker index, mirroring the coverage writer's parallel-safety.
 * Masking is always applied upstream for file sinks (CI-artifact leak guard).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { formatEntry } from "./format.js";
import type { LogEntry, SinkObject } from "./types.js";

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, 80) || "test";
}

export function createFileSink(opts: {
  fileFormat?: "pretty" | "jsonl";
  logDir?: string;
  meta?: { workerIndex?: number; title?: string };
}): SinkObject {
  const format = opts.fileFormat ?? "pretty";
  const dir = opts.logDir ?? "logs";
  const buffer: string[] = [];

  return {
    write(entry: LogEntry): void {
      buffer.push(
        format === "jsonl"
          ? JSON.stringify(entry)
          : formatEntry(entry, { level: "verbose", color: false }),
      );
    },
    flush(): void {
      if (buffer.length === 0) return;
      mkdirSync(dir, { recursive: true });
      const idx = opts.meta?.workerIndex;
      const suffix = idx !== undefined ? `-w${idx}` : "";
      const slug = opts.meta?.title ? slugify(opts.meta.title) : "test";
      const ext = format === "jsonl" ? "jsonl" : "log";
      const file = join(dir, `${slug}${suffix}-${randomUUID()}.${ext}`);
      writeFileSync(file, buffer.join("\n") + "\n");
    },
  };
}
