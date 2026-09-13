import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const registryUrl = "https://registry.npmjs.org/@stewie-sh%2fagent-crystallize/latest";
type Cache = { checkedAt: number; latest?: string; notified?: string; failed?: boolean };

function stableVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}

export async function checkUpdates(options: {
  current: string;
  source: "registry" | "local" | "unknown";
  cachePath: string;
  now?: number;
  fetcher?: typeof fetch;
}) {
  const now = options.now ?? Date.now();
  let cache: Cache | undefined;
  try {
    const parsed = JSON.parse(readFileSync(options.cachePath, "utf8"));
    if (Number.isFinite(parsed.checkedAt) && parsed.checkedAt <= now &&
        (stableVersion(parsed.latest) || parsed.failed === true)) cache = parsed;
  } catch { /* Missing or malformed cache is recoverable. */ }
  const cached = !!cache && now - cache.checkedAt < (cache.failed ? 3_600_000 : 86_400_000);
  if (!cached) {
    try {
      const response = await (options.fetcher ?? fetch)(registryUrl, {
        signal: AbortSignal.timeout(2000), redirect: "error",
      });
      if (!response.ok) throw new Error("Registry unavailable");
      const data = await response.json() as { version?: unknown };
      if (!stableVersion(data.version)) throw new Error("Invalid registry version");
      cache = { checkedAt: now, latest: data.version, notified: cache?.notified };
    } catch {
      cache = { checkedAt: now, failed: true, notified: cache?.notified };
    }
  }
  const latest = cache?.latest;
  let newer = false;
  if (latest && stableVersion(options.current)) {
    const left = latest.split(".").map(Number);
    const right = options.current.split(".").map(Number);
    const first = left.findIndex((value, index) => value !== right[index]);
    newer = first >= 0 && left[first] > right[first];
  }
  const notificationKey = `${options.current}:${latest}:${options.source}`;
  const shouldNotify = newer && cache?.notified !== notificationKey;
  if (shouldNotify && cache) cache.notified = notificationKey;
  let cachePersisted = true;
  try {
    mkdirSync(dirname(options.cachePath), { recursive: true });
    writeFileSync(options.cachePath, JSON.stringify(cache), { mode: 0o600 });
  } catch { cachePersisted = false; }
  return {
    status: cache?.failed ? "unavailable" : newer ? "update_available" : latest && stableVersion(options.current) ? "no_newer_release" : "comparison_unavailable",
    current: options.current, latest, installSource: options.source,
    cached, cachePersisted, shouldNotify, checkedAt: new Date(cache!.checkedAt).toISOString(),
    message: shouldNotify
      ? options.source === "registry"
        ? `npm has ${latest}; installed ${options.current}. Ask the user whether to review release notes and upgrade. Never upgrade automatically.`
        : `npm has ${latest}; installed metadata says ${options.current}. Verify local build/install provenance before offering an upgrade. Never replace a local candidate automatically.`
      : undefined,
  };
}
