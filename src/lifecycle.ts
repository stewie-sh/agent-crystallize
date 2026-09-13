import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

export const actions = ["archive", "restore", "consolidated", "superseded", "corrects", "follows-up", "relates-to"] as const;
export type Action = typeof actions[number];
type Ref = { path: string; hash: string };
type Event = { version: 1; id: string; at: string; action: Action; reason: string; source: string; artifacts: Ref[]; target?: Ref };
export type LifecycleRecord = {
  path: string; validation: { errors: string[] }; supersededBy: string[];
  archived: boolean; consolidatedInto: string[];
  annotations: Array<{ id: string; action: string; reason: string; source: string; at: string; target?: string }>;
};
export function fingerprint(repo: string, path: string) {
  return createHash("sha256").update(readFileSync(resolve(repo, path))).digest("hex");
}
export function withLifecycleLock<T>(repo: string, run: () => T): T {
  const dir = resolve(repo, ".agent-crystals", "annotations");
  mkdirSync(dir, { recursive: true });
  const lock = resolve(dir, ".write.lock");
  const until = Date.now() + 2000;
  let fd: number;
  while (true) {
    try { fd = openSync(lock, "wx"); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= until) throw new Error(`Lifecycle writer busy: ${lock}. Inspect the owner before repairing a stale lock.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    return run();
  } finally { closeSync(fd); unlinkSync(lock); }
}
export function writeAnnotation(repo: string, artifacts: string[], action: Action, reason: string, source: string, target?: string) {
  const dir = resolve(repo, ".agent-crystals", "annotations");
  mkdirSync(dir, { recursive: true });
  const latest = readdirSync(dir).filter(file => /^\d{4}-.*\.json$/.test(file)).sort().at(-1);
  const previous = latest ? Date.parse(latest.slice(0, 24).replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, "T$1:$2:$3.$4Z")) : 0;
  const at = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
  const event: Event = { version: 1, id: randomUUID(), at, action, reason, source,
    artifacts: artifacts.map(path => ({ path, hash: fingerprint(repo, path) })),
    target: target ? { path: target, hash: fingerprint(repo, target) } : undefined };
  const path = resolve(dir, `${event.at.replace(/[:.]/g, "-")}-${event.id}.json`);
  writeFileSync(path, JSON.stringify(event, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { eventId: event.id, path };
}

export function applyAnnotations(repo: string, records: LifecycleRecord[]) {
  const dir = resolve(repo, ".agent-crystals", "annotations");
  const issues: string[] = [];
  if (!existsSync(dir)) return issues;
  const byPath = new Map(records.map(record => [record.path, record]));
  const hashes = new Map<string, string>();
  const verified = (ref: Ref) => {
    const record = ref && byPath.get(ref.path);
    if (!record || record.validation.errors.length) return false;
    if (!hashes.has(ref.path)) hashes.set(ref.path, fingerprint(repo, ref.path));
    return hashes.get(ref.path) === ref.hash;
  };
  for (const file of readdirSync(dir).filter(file => file.endsWith(".json")).sort()) {
    try {
      const event = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Event;
      if (event.version !== 1 || !actions.includes(event.action) || !event.id ||
          !Number.isFinite(Date.parse(event.at)) || typeof event.reason !== "string" || !event.reason.trim() ||
          typeof event.source !== "string" || !event.source.trim() || !Array.isArray(event.artifacts) || !event.artifacts.length ||
          !event.artifacts.every(verified) ||
          (event.action !== "archive" && event.action !== "restore" && !event.target) ||
          (event.target && (!verified(event.target) || event.artifacts.some(ref => ref.path === event.target!.path)))) {
        throw new Error("invalid annotation, missing reference or changed source fingerprint");
      }
      for (const ref of event.artifacts) {
        const record = byPath.get(ref.path)!;
        record.annotations.push({ id: event.id, action: event.action, reason: event.reason, source: event.source, at: event.at, target: event.target?.path });
        if (event.action === "archive") record.archived = true;
        if (event.action === "restore") { record.archived = false; record.consolidatedInto = []; }
        if (event.action === "consolidated") record.consolidatedInto.push(event.target!.path);
        if (event.action === "superseded") record.supersededBy.push(event.target!.path);
      }
    } catch {
      issues.push(`${file}: annotation ignored; invalid data or changed/missing references`);
    }
  }
  // Hide consolidated sources only while a usable projection remains reachable.
  const usable = (path: string, seen = new Set<string>()): boolean => {
    if (seen.has(path)) return false;
    seen.add(path);
    const record = byPath.get(path);
    if (!record || record.archived || record.validation.errors.length) return false;
    const next = [...record.consolidatedInto, ...record.supersededBy];
    return next.length === 0 || next.some(target => usable(target, new Set(seen)));
  };
  const projected = records.map(record => [record, record.consolidatedInto.filter(path => usable(path))] as const);
  for (const [record, targets] of projected) record.consolidatedInto = targets;
  return issues;
}
