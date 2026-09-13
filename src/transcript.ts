import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface TranscriptAnchor {
  uri: string;
  lines: string;
  sha256: string;
  bytes: number;
}

// Bounds protect both memory and prefix scanning; raw transcript text never leaves this reader.
export function transcriptAnchor(uri: string | undefined, range: string): TranscriptAnchor {
  if (!uri) throw new Error("--transcript-lines requires --transcript-uri.");
  const match = /^([1-9]\d*)-([1-9]\d*)$/.exec(range);
  const start = Number(match?.[1]);
  const end = Number(match?.[2]);
  if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start >= 1000) {
    throw new Error("Transcript lines must be START-END, one-based inclusive, at most 1000 lines.");
  }
  const path = uri.startsWith("file:") ? fileURLToPath(uri) : uri.startsWith("~/") ? join(homedir(), uri.slice(2)) : uri;
  if (!isAbsolute(path)) throw new Error("A verified transcript anchor requires an absolute local path or file URI.");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) throw new Error("Transcript source must be a regular file.");
    const hash = createHash("sha256");
    const chunk = Buffer.alloc(64 * 1024);
    let pending: Buffer = Buffer.alloc(0);
    let line = 1;
    let scanned = 0;
    let bytes = 0;
    const consume = (value: Buffer) => {
      if (value.length > 1024 * 1024) throw new Error("Transcript line exceeds the 1 MiB limit.");
      if (line >= start && line <= end) {
        bytes += value.length;
        if (bytes > 256 * 1024) throw new Error("Transcript selection exceeds the 256 KiB limit.");
        hash.update(value);
      }
      line++;
    };
    while (line <= end) {
      if (scanned >= 64 * 1024 * 1024) throw new Error("Transcript prefix exceeds the 64 MiB scan limit; use a smaller source slice.");
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) {
        if (pending.length) consume(pending);
        break;
      }
      scanned += count;
      const data = Buffer.concat([pending, chunk.subarray(0, count)]);
      let offset = 0;
      let newline: number;
      while (line <= end && (newline = data.indexOf(10, offset)) !== -1) {
        consume(data.subarray(offset, newline + 1));
        offset = newline + 1;
      }
      pending = data.subarray(offset);
      if (line <= end && pending.length > 1024 * 1024) throw new Error("Transcript line exceeds the 1 MiB limit.");
    }
    if (line <= end) throw new Error("Requested transcript lines are not present; no anchor created.");
    const after = fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error("Transcript changed while reading; retry with a stable source.");
    }
    return { uri: path, lines: `${start}-${end}`, sha256: hash.digest("hex"), bytes };
  } finally {
    closeSync(fd);
  }
}
