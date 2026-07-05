#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, fstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const command = args.shift();

const requiredSections = [
  "Header",
  "Current Focus",
  "Durable Framing",
  "Checkpoint Trail",
  "Decisions",
  "Findings",
  "Reality Checks",
  "Artifacts Changed",
  "Tests And Verification",
  "Open Loops",
  "Memory Candidates",
  "Next Actions",
  "Resume Prompt",
];

const hookEvents = ["SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolBatch", "PreCompact", "PostCompact", "Stop"] as const;

try {
  const result = await run(command, args);
  if (result !== undefined) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function run(name: string | undefined, rest: string[]) {
  switch (name) {
    case "now":
      return crystallize(rest, "crystal");
    case "checkpoint":
      return crystallize(rest, "checkpoint");
    case "validate":
      return validate(rest);
    case "manifest":
      return manifest(rest);
    case "hook":
      return hook(rest);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      usage();
      return undefined;
    default:
      throw new Error(`Unknown command: ${name}`);
  }
}

type ArtifactKind = "crystal" | "checkpoint";

type HookEvent = (typeof hookEvents)[number];

interface HookState {
  projects: Record<string, HookProjectState>;
}

interface HookProjectState {
  cwd: string;
  lastActivityAt?: string;
  lastActivityEvent?: string;
  lastCheckpointAt?: string;
  lastCheckpointPath?: string;
  lastCheckpointEvent?: string;
  lastPreCompactAt?: string;
  lastSessionStartAt?: string;
  lastInjectedContextHash?: string;
  lastInjectedContextAt?: string;
}

interface ArtifactRecord {
  path: string;
  kind: "checkpoint" | "session" | "unknown";
  title: string;
  observedAt?: string;
  project?: string;
  scope?: string;
  topics: string[];
  relations: RelationHint[];
  currentFocus: string;
  mtime: string;
  validation: {
    errors: string[];
    warnings: string[];
  };
  supersededBy: string[];
}

async function crystallize(rest: string[], kind: ArtifactKind) {
  const repo = resolve(takeFlag(rest, "--repo") ?? process.cwd());
  const budget = takeFlag(rest, "--budget") ?? (kind === "checkpoint" ? "fast" : "standard");
  const scope = takeFlag(rest, "--scope") ?? "project";
  const project = takeFlag(rest, "--project") ?? basename(repo);
  const title =
    takeFlag(rest, "--title") ??
    (kind === "checkpoint"
      ? `Context Checkpoint - ${project} - ${formatDate(new Date())}`
      : `Context Crystal - ${project} - ${formatDate(new Date())}`);
  const surface = takeFlag(rest, "--surface") ?? "cli";
  const bodyFlag = takeFlag(rest, "--body");
  const readStdin = takeBooleanFlag(rest, "--stdin");
  const fromCheckpoints = takeFlag(rest, "--from-checkpoints");
  const checkpointDir = takeFlag(rest, "--checkpoint-dir");
  const structured = takeStructuredFields(rest);
  const outDir = resolve(repo, takeFlag(rest, "--out-dir") ?? (kind === "checkpoint" ? ".agent-crystals/checkpoints" : ".agent-crystals/sessions"));
  const body = bodyFlag ?? (readStdin ? await readStdinBody() : rest.join(" ").trim());

  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);
  if (!["fast", "standard", "deep"].includes(budget)) {
    throw new Error(`Invalid --budget ${budget}; expected fast, standard, or deep.`);
  }
  if (fromCheckpoints && fromCheckpoints !== "latest") {
    throw new Error(`Invalid --from-checkpoints ${fromCheckpoints}; expected latest.`);
  }

  const observedAt = new Date();
  const git = collectGitContext(repo);
  const checkpointTrail =
    kind === "crystal" && fromCheckpoints === "latest"
      ? collectCheckpointTrail(repo, checkpointDir ?? ".agent-crystals/checkpoints")
      : [];
  const instructionFiles = ["AGENTS.md", "CLAUDE.md", "docs/context/WARM_START.md"].filter((path) =>
    existsSync(resolve(repo, path)),
  );
  const filename = `${compactTimestamp(observedAt)}-${slugify(title)}.md`;
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, filename);
  const relativePath = relative(repo, path);
  const markdown = renderCrystal({
    kind,
    title,
    scope,
    project,
    budget,
    repo,
    surface,
    observedAt,
    body,
    structured,
    git,
    checkpointTrail,
    instructionFiles,
    outputRelativePath: relativePath,
  });
  writeFileSync(path, markdown, "utf8");

  const result: Record<string, unknown> = {
    ok: true,
    path,
    relativePath,
    repo,
    project,
    scope,
    budget,
    kind,
    checkpointCount: checkpointTrail.length,
    note: "Local artifact written. Sync/storage adapters can import this artifact later.",
  };

  return result;
}

async function hook(rest: string[]) {
  const input = readJsonStdinIfAvailable();
  const repo = resolve(takeFlag(rest, "--repo") ?? stringField(input, "cwd") ?? process.cwd());
  const harness = takeFlag(rest, "--harness") ?? stringField(input, "harness") ?? "hook";
  const event = (takeFlag(rest, "--event") ?? stringField(input, "hook_event_name") ?? stringField(input, "event") ?? "SessionStart") as HookEvent;
  const stateDir = resolve(takeFlag(rest, "--state-dir") ?? join(homedir(), ".agent-crystallize", "hooks"));
  const stopCheckpointMs = Number(takeFlag(rest, "--stop-checkpoint-ms") ?? 25 * 60 * 1000);
  const dedupeWindowMs = Number(takeFlag(rest, "--dedupe-window-ms") ?? 10 * 60 * 1000);
  const strictPrecompact = takeBooleanFlag(rest, "--strict-precompact");
  const maxPointers = Number(takeFlag(rest, "--max-pointers") ?? 3);
  const includeTranscriptUri = takeBooleanFlag(rest, "--include-transcript-uri");
  if (rest.length > 0) {
    throw new Error(`Unexpected hook arguments: ${rest.join(" ")}`);
  }
  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);
  if (!Number.isFinite(stopCheckpointMs) || stopCheckpointMs < 0) throw new Error("--stop-checkpoint-ms must be a non-negative number.");
  if (!Number.isFinite(dedupeWindowMs) || dedupeWindowMs < 0) throw new Error("--dedupe-window-ms must be a non-negative number.");
  if (!Number.isFinite(maxPointers) || maxPointers < 1) throw new Error("--max-pointers must be a positive number.");
  if (!isHookEvent(event)) throw new Error(`Invalid --event ${event}; expected one of ${hookEvents.join(", ")}.`);

  const statePath = join(stateDir, "state.json");
  const state = loadHookState(statePath);
  const key = stableKey(repo);
  const projectState = state.projects[key] ?? { cwd: repo };
  projectState.cwd = repo;

  const save = () => {
    state.projects[key] = projectState;
    saveHookState(statePath, state);
  };

  switch (event) {
    case "SessionStart": {
      const context = renderSessionStartContext(repo, harness, projectState, maxPointers, dedupeWindowMs);
      const fullContextHash = stableKey(context.fullContext);
      projectState.lastSessionStartAt = new Date().toISOString();
      projectState.lastInjectedContextHash = fullContextHash;
      projectState.lastInjectedContextAt = new Date().toISOString();
      save();
      outputHookContext(harness, context.output);
      return undefined;
    }
    case "UserPromptSubmit": {
      projectState.lastActivityAt = new Date().toISOString();
      projectState.lastActivityEvent = event;
      save();
      return undefined;
    }
    case "PostToolUse":
    case "PostToolBatch": {
      projectState.lastActivityAt = new Date().toISOString();
      projectState.lastActivityEvent = event;
      save();
      return undefined;
    }
    case "PreCompact": {
      try {
        const checkpoint = await createHookCheckpoint({
          repo,
          harness,
          event,
          input,
          includeTranscriptUri,
          body: [
            "Pre-compact checkpoint requested by lifecycle hook.",
            `Trigger: ${stringField(input, "trigger") ?? "unknown"}.`,
            stringField(input, "custom_instructions")
              ? `Custom compact instructions: ${excerpt(stringField(input, "custom_instructions") ?? "", 1000)}.`
              : undefined,
            `Last activity: ${projectState.lastActivityAt ?? "unknown"}.`,
            "Purpose: preserve high-signal work state before lossy context compaction.",
          ]
            .filter(Boolean)
            .join("\n"),
          decision: "PreCompact is a lifecycle boundary; write a local checkpoint before compaction proceeds.",
          finding: "Hook-created checkpoints are local-first artifacts and do not require mind-core.",
          openLoop: "After compaction, resume from the latest local checkpoint or session crystal before acting.",
          nextAction: "Read the latest checkpoint under .agent-crystals/checkpoints/ after compaction.",
        });
        projectState.lastCheckpointAt = new Date().toISOString();
        projectState.lastCheckpointPath = stringRecordField(checkpoint, "relativePath");
        projectState.lastCheckpointEvent = event;
        projectState.lastPreCompactAt = projectState.lastCheckpointAt;
        save();
      } catch (error) {
        save();
        if (strictPrecompact) {
          throw error;
        }
        process.stderr.write(`agent-crystallize hook PreCompact checkpoint failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      return undefined;
    }
    case "PostCompact": {
      const lastPreCompact = projectState.lastPreCompactAt ? Date.parse(projectState.lastPreCompactAt) : 0;
      if (lastPreCompact > 0 && Date.now() - lastPreCompact <= dedupeWindowMs) {
        projectState.lastActivityAt = new Date().toISOString();
        projectState.lastActivityEvent = event;
        save();
        return undefined;
      }
      const compactSummary = stringField(input, "compact_summary") ?? "";
      const checkpoint = await createHookCheckpoint({
        repo,
        harness,
        event,
        input,
        includeTranscriptUri,
        body: [
          "Post-compact summary captured by lifecycle hook.",
          `Trigger: ${stringField(input, "trigger") ?? "unknown"}.`,
          compactSummary ? `Compact summary: ${excerpt(compactSummary, 2000)}` : "No compact_summary field was supplied.",
        ].join("\n"),
        decision: "PostCompact summaries are evidence, not the sole source of truth.",
        finding: "No recent PreCompact checkpoint was recorded, so PostCompact wrote a local checkpoint.",
        openLoop: "Verify whether important decisions survived compaction before continuing.",
        nextAction: "Read the PostCompact checkpoint and inspect changed files before acting.",
      });
      projectState.lastCheckpointAt = new Date().toISOString();
      projectState.lastCheckpointPath = stringRecordField(checkpoint, "relativePath");
      projectState.lastCheckpointEvent = event;
      save();
      return undefined;
    }
    case "Stop": {
      const lastActivity = projectState.lastActivityAt ? Date.parse(projectState.lastActivityAt) : 0;
      const lastCheckpoint = projectState.lastCheckpointAt ? Date.parse(projectState.lastCheckpointAt) : 0;
      if (lastActivity > lastCheckpoint && Date.now() - lastCheckpoint >= stopCheckpointMs) {
        const checkpoint = await createHookCheckpoint({
          repo,
          harness,
          event,
          input,
          includeTranscriptUri,
          body: [
            "Stop hook created a cadence checkpoint after sustained uncheckpointed activity.",
            `Last activity: ${projectState.lastActivityAt ?? "unknown"}.`,
            `Last activity event: ${projectState.lastActivityEvent ?? "unknown"}.`,
            "This checkpoint is a fallback, not a substitute for explicit high-signal crystallization.",
          ].join("\n"),
          decision: "Stop hooks should checkpoint only as a cadence fallback.",
          finding: "There was activity after the latest checkpoint and the checkpoint interval elapsed.",
          openLoop: "Review whether this fallback checkpoint needs a richer session crystal.",
          nextAction: "If ending the task, create a fuller session crystal with agent-crystallize now.",
        });
        projectState.lastCheckpointAt = new Date().toISOString();
        projectState.lastCheckpointPath = stringRecordField(checkpoint, "relativePath");
        projectState.lastCheckpointEvent = event;
      }
      save();
      return undefined;
    }
    default:
      save();
      return undefined;
  }
}

async function createHookCheckpoint(input: {
  repo: string;
  harness: string;
  event: HookEvent;
  input: Record<string, unknown>;
  includeTranscriptUri: boolean;
  body: string;
  decision: string;
  finding: string;
  openLoop: string;
  nextAction: string;
}) {
  const project = basename(input.repo) || "project";
  const args = [
    "--repo",
    input.repo,
    "--scope",
    "project",
    "--project",
    project,
    "--budget",
    "fast",
    "--title",
    `${input.event} checkpoint - ${project} - ${formatDate(new Date())}`,
    "--surface",
    input.harness,
    "--agent-body",
    input.harness,
    "--harness",
    input.harness,
    "--provenance",
    `hook_event=${input.event}`,
    "--topic",
    "agent-context-crystallization",
    "--topic",
    "context-persistence",
    "--decision",
    input.decision,
    "--finding",
    input.finding,
    "--open-loop",
    input.openLoop,
    "--test",
    "agent-crystallize hook command completed.",
    "--next-action",
    input.nextAction,
    "--evidence",
    `hook_event:${input.event}`,
    "--memory-candidate",
    "Lifecycle hooks should reduce human checkpointing burden while keeping generated artifacts local-first.",
  ];
  const sessionId = stringField(input.input, "session_id") ?? stringField(input.input, "sessionId");
  if (sessionId) args.push("--session-id", sessionId);
  const transcriptUri = stringField(input.input, "transcript_path") ?? stringField(input.input, "transcriptUri");
  if (input.includeTranscriptUri && transcriptUri) args.push("--transcript-uri", transcriptUri);
  args.push("--body", input.body);
  return crystallize(args, "checkpoint");
}

function readJsonStdinIfAvailable(): Record<string, unknown> {
  try {
    const stat = fstatSync(0);
    if (!stat.isFIFO() && !stat.isFile()) return {};
    const raw = readFileSync(0, "utf8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function loadHookState(path: string): HookState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && parsed.projects && typeof parsed.projects === "object" ? parsed : { projects: {} };
  } catch {
    return { projects: {} };
  }
}

function saveHookState(path: string, state: HookState) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function renderSessionStartContext(
  repo: string,
  harness: string,
  state: HookProjectState,
  maxPointers: number,
  dedupeWindowMs: number,
) {
  const activeArtifacts = collectArtifactRecords(repo, ".agent-crystals").filter((record) => record.supersededBy.length === 0);
  const sessions = activeArtifacts.filter((record) => record.kind === "session").slice(0, maxPointers);
  const checkpoints = activeArtifacts.filter((record) => record.kind === "checkpoint").slice(0, maxPointers);
  const lines = [
    "agent-crystallize bootstrap:",
    `- Repo: ${repo}`,
    "- Local crystals are work context, not hidden chain-of-thought.",
    "- Before acting after a fresh/resumed/compacted session, inspect the latest relevant local artifacts.",
  ];
  if (sessions.length > 0) {
    lines.push("- Latest session crystals:");
    for (const item of sessions) lines.push(`  - ${item.path} (${item.observedAt ?? item.mtime})`);
  }
  if (checkpoints.length > 0) {
    lines.push("- Latest checkpoints:");
    for (const item of checkpoints) lines.push(`  - ${item.path} (${item.observedAt ?? item.mtime})`);
  }
  if (sessions.length === 0 && checkpoints.length === 0) {
    lines.push("- No local .agent-crystals artifacts were found for this repo yet.");
  }
  lines.push("- If mind-core or another memory layer is configured by your harness, use it as an optional pointer/index layer; agent-crystallize remains the local artifact writer.");
  const fullContext = lines.join("\n");
  const currentHash = stableKey(fullContext);
  const lastInjectedAt = state.lastInjectedContextAt ? Date.parse(state.lastInjectedContextAt) : 0;
  const shouldDedupe =
    state.lastInjectedContextHash === currentHash &&
    lastInjectedAt > 0 &&
    Date.now() - lastInjectedAt <= dedupeWindowMs;
  const output = shouldDedupe
    ? [
        "agent-crystallize bootstrap:",
        "- Local checkpoint pointers are unchanged since the recent SessionStart bootstrap.",
        sessions[0] ? `- Latest session crystal: ${sessions[0].path}` : undefined,
        checkpoints[0] ? `- Latest checkpoint: ${checkpoints[0].path}` : undefined,
      ]
        .filter(Boolean)
        .join("\n")
    : fullContext;
  return { output, fullContext };
}

function outputHookContext(harness: string, context: string) {
  if (harness === "claude-code") {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: context,
        },
        suppressOutput: true,
      })}\n`,
    );
    return;
  }
  process.stdout.write(`${context}\n`);
}

function stableKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isHookEvent(value: string): value is HookEvent {
  return (hookEvents as readonly string[]).includes(value);
}

function stringField(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringRecordField(input: unknown, key: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function validate(rest: string[]) {
  const repo = resolve(takeFlag(rest, "--repo") ?? process.cwd());
  const crystalsDir = takeFlag(rest, "--crystals-dir") ?? ".agent-crystals";
  const explicitFiles = takeRepeatedFlag(rest, "--files");
  const failOnWarnings = takeBooleanFlag(rest, "--fail-on-warnings");
  if (rest.length > 0) {
    throw new Error(`Unexpected validate arguments: ${rest.join(" ")}`);
  }
  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);

  const root = resolve(repo, crystalsDir);
  const files =
    explicitFiles.length > 0
      ? explicitFiles.map((file) => resolve(repo, file)).map((file) => validateExplicitFile(file)).sort()
      : existsSync(root)
        ? listMarkdownFiles(root).sort()
        : [];
  const results = files.map((absolutePath) => validateCrystalFile(repo, absolutePath));
  const errorCount = results.reduce((count, result) => count + result.errors.length, 0);
  const warningCount = results.reduce((count, result) => count + result.warnings.length, 0);
  const ok = errorCount === 0 && (!failOnWarnings || warningCount === 0);

  if (!ok) process.exitCode = 1;

  return {
    ok,
    repo,
    crystalsDir: explicitFiles.length > 0 ? undefined : crystalsDir,
    filesMode: explicitFiles.length > 0,
    fileCount: results.length,
    errorCount,
    warningCount,
    files: results,
  };
}

function manifest(rest: string[]) {
  const repo = resolve(takeFlag(rest, "--repo") ?? process.cwd());
  const crystalsDir = takeFlag(rest, "--crystals-dir") ?? ".agent-crystals";
  const includeSuperseded = takeBooleanFlag(rest, "--include-superseded");
  const write = takeBooleanFlag(rest, "--write");
  if (rest.length > 0) {
    throw new Error(`Unexpected manifest arguments: ${rest.join(" ")}`);
  }
  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);

  const generatedAt = new Date().toISOString();
  const records = collectArtifactRecords(repo, crystalsDir);
  const activeArtifacts = records.filter((record) => record.supersededBy.length === 0);
  const supersededArtifacts = records.filter((record) => record.supersededBy.length > 0);
  const output = {
    generatedAt,
    repo,
    crystalsDir,
    artifactCount: records.length,
    activeCount: activeArtifacts.length,
    supersededCount: supersededArtifacts.length,
    activeArtifacts,
    supersededArtifacts: includeSuperseded ? supersededArtifacts : undefined,
  };

  if (write) {
    const manifestPath = resolve(repo, crystalsDir, "manifest.json");
    mkdirSync(resolve(manifestPath, ".."), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    return { ...output, path: manifestPath, relativePath: relative(repo, manifestPath) };
  }
  return output;
}

function collectArtifactRecords(repo: string, crystalsDir: string): ArtifactRecord[] {
  const root = resolve(repo, crystalsDir);
  const files = existsSync(root) ? listMarkdownFiles(root).sort() : [];
  const records = files.map((absolutePath) => artifactRecordFromFile(repo, absolutePath));
  const supersededBy = new Map<string, string[]>();
  const pathAliases = new Map<string, string>();
  for (const record of records) {
    pathAliases.set(record.path, record.path);
    pathAliases.set(`./${record.path}`, record.path);
    pathAliases.set(basename(record.path), record.path);
  }
  for (const record of records) {
    for (const relation of record.relations) {
      if (relation.type !== "supersedes") continue;
      const target = pathAliases.get(relation.target) ?? pathAliases.get(relation.target.replace(/^\.\//, ""));
      if (!target) continue;
      const superseders = supersededBy.get(target) ?? [];
      superseders.push(record.path);
      supersededBy.set(target, superseders);
    }
  }
  for (const record of records) {
    record.supersededBy = supersededBy.get(record.path) ?? [];
  }
  return records.sort((a, b) => {
    const byObserved = (b.observedAt ?? b.mtime).localeCompare(a.observedAt ?? a.mtime);
    return byObserved || a.path.localeCompare(b.path);
  });
}

function artifactRecordFromFile(repo: string, absolutePath: string): ArtifactRecord {
  const markdown = readFileSync(absolutePath, "utf8");
  const path = relative(repo, absolutePath);
  const validation = validateCrystalFile(repo, absolutePath);
  return {
    path,
    kind: validation.kind,
    title: extractTitle(markdown) ?? basename(path),
    observedAt: extractHeaderValue(markdown, "Observed at"),
    project: extractHeaderValue(markdown, "Project"),
    scope: extractHeaderValue(markdown, "Scope"),
    topics: extractBullets(extractSection(markdown, "Topics") ?? "").filter((item) => !item.toLowerCase().startsWith("no explicit topics")),
    relations: extractRelations(extractSection(markdown, "Relation Hints") ?? ""),
    currentFocus: excerpt(extractSection(markdown, "Current Focus") ?? "", 300),
    mtime: new Date(statSync(absolutePath).mtimeMs).toISOString(),
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
    },
    supersededBy: [],
  };
}

function extractBullets(section: string) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function extractRelations(section: string): RelationHint[] {
  return extractBullets(section)
    .map((item) => {
      const separator = item.indexOf(":");
      if (separator <= 0 || separator === item.length - 1) return undefined;
      return {
        type: item.slice(0, separator).trim(),
        target: item.slice(separator + 1).trim(),
      };
    })
    .filter((item): item is RelationHint => Boolean(item));
}

interface ValidationResult {
  path: string;
  kind: "checkpoint" | "session" | "unknown";
  errors: string[];
  warnings: string[];
}

function validateCrystalFile(repo: string, absolutePath: string): ValidationResult {
  const markdown = readFileSync(absolutePath, "utf8");
  const path = relative(repo, absolutePath);
  const errors: string[] = [];
  const warnings: string[] = [];
  const title = extractTitle(markdown);

  if (!title) errors.push("missing top-level title");

  for (const section of requiredSections) {
    if (!hasSection(markdown, section)) errors.push(`missing section: ${section}`);
  }

  for (const field of ["Scope", "Project", "Observed at"]) {
    if (!extractHeaderValue(markdown, field)) errors.push(`missing header field: ${field}`);
  }

  const currentFocus = extractSection(markdown, "Current Focus") ?? "";
  if (isTodoOnly(currentFocus)) errors.push("Current Focus is empty or TODO-only");

  for (const section of ["Decisions", "Findings", "Tests And Verification", "Open Loops"]) {
    const body = extractSection(markdown, section) ?? "";
    if (isTodoOnly(body)) warnings.push(`${section} is TODO-only`);
  }
  if (!hasSection(markdown, "Session Provenance")) {
    warnings.push("Session Provenance is missing; newer crystals should include safe session/source pointers when available");
  }
  const memoryCandidates = extractSection(markdown, "Memory Candidates") ?? "";
  if (isTodoOnly(memoryCandidates)) warnings.push("Memory Candidates is TODO-only");

  const resumePrompt = extractSection(markdown, "Resume Prompt") ?? "";
  if (!resumePrompt.includes(path) && !resumePrompt.includes(basename(path))) {
    warnings.push("Resume Prompt does not reference this artifact path or filename");
  }

  return {
    path,
    kind: path.includes("/checkpoints/") ? "checkpoint" : path.includes("/sessions/") ? "session" : "unknown",
    errors,
    warnings,
  };
}

interface GitContext {
  root?: string;
  commit?: string;
  branch?: string;
  statusShort?: string;
  diffStat?: string;
  changedFiles?: string;
  error?: string;
}

interface CheckpointSummary {
  path: string;
  title: string;
  observedAt?: string;
  focus: string;
}

interface StructuredFields {
  topics: string[];
  relations: RelationHint[];
  provenance: ProvenanceFields;
  decisions: string[];
  findings: string[];
  openLoops: string[];
  tests: string[];
  nextActions: string[];
  evidence: string[];
  memoryCandidates: string[];
}

interface RelationHint {
  type: string;
  target: string;
}

interface ProvenanceFields {
  agentBody?: string;
  harness?: string;
  harnessVersion?: string;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  conversationId?: string;
  taskId?: string;
  transcriptUri?: string;
  model?: string;
  sourceRefs: string[];
  custom: ProvenancePair[];
}

interface ProvenancePair {
  key: string;
  value: string;
}

function collectGitContext(repo: string): GitContext {
  const root = git(repo, ["rev-parse", "--show-toplevel"]);
  if (!root) return { error: "not a git repository or git unavailable" };
  return {
    root,
    commit: git(repo, ["rev-parse", "--short", "HEAD"]),
    branch: git(repo, ["branch", "--show-current"]),
    statusShort: git(repo, ["status", "--short"]) ?? "",
    diffStat: git(repo, ["diff", "--stat"]) ?? "",
    changedFiles: git(repo, ["diff", "--name-only"]) ?? "",
  };
}

function git(repo: string, gitArgs: string[]) {
  try {
    return execFileSync("git", gitArgs, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return undefined;
  }
}

function collectCheckpointTrail(repo: string, checkpointDir: string): CheckpointSummary[] {
  const absoluteDir = resolve(repo, checkpointDir);
  if (!existsSync(absoluteDir)) return [];

  return readdirSync(absoluteDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => {
      const absolutePath = resolve(absoluteDir, entry);
      return {
        absolutePath,
        relativePath: relative(repo, absolutePath),
        mtimeMs: statSync(absolutePath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.relativePath.localeCompare(a.relativePath))
    .slice(0, 5)
    .map(({ absolutePath, relativePath }) => {
      const markdown = readFileSync(absolutePath, "utf8");
      return {
        path: relativePath,
        title: extractTitle(markdown) ?? basename(relativePath),
        observedAt: extractHeaderValue(markdown, "Observed at"),
        focus: excerpt(extractSection(markdown, "Current Focus") ?? "", 500),
      };
    });
}

function extractTitle(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function extractHeaderValue(markdown: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.match(new RegExp(`^- ${escaped}:\\s*(.+)$`, "m"))?.[1]?.trim();
}

function extractSection(markdown: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^## ${escaped}\\s*$`, "m").exec(markdown);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.search(/\n## /);
  const section = nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
  return section.trim();
}

function hasSection(markdown: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^## ${escaped}\\s*$`, "m").test(markdown);
}

function isTodoOnly(value: string) {
  const normalized = value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[-*\d.]+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized.length === 0 || normalized.startsWith("todo:");
}

function listMarkdownFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function validateExplicitFile(absolutePath: string) {
  if (!existsSync(absolutePath)) {
    throw new Error(`File does not exist: ${absolutePath}`);
  }
  if (!statSync(absolutePath).isFile()) {
    throw new Error(`Path is not a file: ${absolutePath}`);
  }
  if (!absolutePath.endsWith(".md")) {
    throw new Error(`File is not Markdown: ${absolutePath}`);
  }
  return absolutePath;
}

function excerpt(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized || "(no current focus captured)";
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function renderCrystal(input: {
  kind: ArtifactKind;
  title: string;
  scope: string;
  project: string;
  budget: string;
  repo: string;
  surface: string;
  observedAt: Date;
  body: string;
  structured: StructuredFields;
  git: GitContext;
  checkpointTrail: CheckpointSummary[];
  instructionFiles: string[];
  outputRelativePath: string;
}) {
  const currentFocus =
    input.body ||
    (input.checkpointTrail.length > 0
      ? "No explicit session body was supplied. Use the checkpoint trail below as provenance anchors; inspect source checkpoints for details before acting."
      : "No explicit current focus body was supplied. Treat this artifact as a structural checkpoint until a richer handoff is written.");
  const noun = input.kind === "checkpoint" ? "checkpoint" : "crystal";
  const sourceWindow = input.kind === "checkpoint" ? "manual mini-crystallization checkpoint" : "manual CLI snapshot";
  return `# ${input.title}

## Header

- Scope: ${input.scope}
- Project: ${input.project}
- Source window: ${sourceWindow}
- Budget: ${input.budget}
- Surface: ${input.surface}
- Repo: ${input.repo}
- Observed at: ${input.observedAt.toISOString()}

## Current Focus

${currentFocus}

## Durable Framing

- Crystallization preserves durable work context, not hidden chain-of-thought.
- Checkpoints are mini-crystallizations: lightweight save-points for long goals across compaction and sessions.
- Raw sessions and tool outputs are evidence, not truth.
- Derived decisions/findings should keep provenance back to evidence.
- Topics and relation hints are lightweight metadata for later indexing, not a graph database.

${renderCheckpointTrail(input.kind, input.checkpointTrail)}

## Topics

${renderBullets(input.structured.topics, "No explicit topics captured.")}

## Relation Hints

${renderRelations(input.structured.relations)}

## Session Provenance

${renderSessionProvenance(input.structured.provenance, input.surface)}

## Decisions

${renderBullets(input.structured.decisions, "No separate decisions captured beyond Current Focus.")}

## Findings

${renderBullets(input.structured.findings, "No separate findings captured beyond Current Focus.")}

## Reality Checks

- Git commit: ${input.git.commit ?? "unknown"}
- Git branch: ${input.git.branch ?? "unknown"}
- Git root: ${input.git.root ?? input.git.error ?? "unknown"}

## Artifacts Changed

### Git Status

\`\`\`text
${input.git.statusShort || "(clean or unavailable)"}
\`\`\`

### Diff Stat

\`\`\`text
${input.git.diffStat || "(no unstaged diff or unavailable)"}
\`\`\`

### Changed Files

\`\`\`text
${input.git.changedFiles || "(none or unavailable)"}
\`\`\`

### Instruction Files Present

${input.instructionFiles.length > 0 ? input.instructionFiles.map((file) => `- ${file}`).join("\n") : "- (none detected)"}

### Evidence Pointers

${renderBullets(input.structured.evidence, "(none provided)")}

## Tests And Verification

${renderBullets(input.structured.tests, "No separate verification captured for this artifact.")}

## Open Loops

${renderBullets(input.structured.openLoops, "No separate open loops captured beyond Next Actions.")}

## Memory Candidates

${renderBullets(input.structured.memoryCandidates, "No explicit memory candidates captured. Do not treat absent candidates as proof there was nothing to learn.")}

## Next Actions

${renderNumbered(input.structured.nextActions, [
  `Review the source context if this ${noun} needs richer decisions, findings, or verification detail.`,
  `Import or link this ${noun} from any memory system you trust when useful.`,
  `Use this ${noun} as a resume source after compaction or handoff.`,
])}

## Resume Prompt

\`\`\`text
Read ${input.repo}/AGENTS.md if present, then read this ${noun}:
${input.repo}/${input.outputRelativePath}

Resume from Current Focus, Decisions, Open Loops, and Next Actions.
\`\`\`
`;
}

function renderCheckpointTrail(kind: ArtifactKind, checkpoints: CheckpointSummary[]) {
  if (kind === "checkpoint") {
    return `## Checkpoint Trail

- This artifact is itself a checkpoint. Session crystals can roll up checkpoints with \`agent-crystallize now --from-checkpoints latest\`.`;
  }

  if (checkpoints.length === 0) {
    return `## Checkpoint Trail

- No checkpoint trail was requested or discovered. Use \`--from-checkpoints latest\` to roll up recent checkpoints into a session crystal.`;
  }

  return `## Checkpoint Trail

Recent checkpoints used as provenance anchors. Deduplicate against these instead of restating each one in full.

${checkpoints
  .map((checkpoint) => {
    const observed = checkpoint.observedAt ? ` (${checkpoint.observedAt})` : "";
    return `- \`${checkpoint.path}\`: ${checkpoint.title}${observed}
  - Focus: ${checkpoint.focus}`;
  })
  .join("\n")}`;
}

async function readStdinBody() {
  let body = "";
  for await (const chunk of process.stdin) {
    body += String(chunk);
  }
  return body.trim();
}

function takeStructuredFields(values: string[]): StructuredFields {
  return {
    topics: [...takeRepeatedFlag(values, "--topic"), ...takeRepeatedFlag(values, "--tag")],
    relations: parseRelationHints(takeRepeatedFlag(values, "--relation")),
    provenance: takeProvenanceFields(values),
    decisions: takeRepeatedFlag(values, "--decision"),
    findings: takeRepeatedFlag(values, "--finding"),
    openLoops: takeRepeatedFlag(values, "--open-loop"),
    tests: takeRepeatedFlag(values, "--test"),
    nextActions: takeRepeatedFlag(values, "--next-action"),
    evidence: takeRepeatedFlag(values, "--evidence"),
    memoryCandidates: takeRepeatedFlag(values, "--memory-candidate"),
  };
}

function takeProvenanceFields(values: string[]): ProvenanceFields {
  return {
    agentBody: takeFlag(values, "--agent-body"),
    harness: takeFlag(values, "--harness"),
    harnessVersion: takeFlag(values, "--harness-version"),
    sessionId: takeFlag(values, "--session-id"),
    threadId: takeFlag(values, "--thread-id"),
    runId: takeFlag(values, "--run-id"),
    conversationId: takeFlag(values, "--conversation-id"),
    taskId: takeFlag(values, "--task-id"),
    transcriptUri: takeFlag(values, "--transcript-uri"),
    model: takeFlag(values, "--model"),
    sourceRefs: takeRepeatedFlag(values, "--source-ref"),
    custom: parseProvenancePairs(takeRepeatedFlag(values, "--provenance")),
  };
}

function parseRelationHints(values: string[]): RelationHint[] {
  return values.map((value) => {
    const separator = value.indexOf(":");
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error(`Invalid --relation ${value}; expected type:target.`);
    }
    return {
      type: value.slice(0, separator).trim(),
      target: value.slice(separator + 1).trim(),
    };
  });
}

function parseProvenancePairs(values: string[]): ProvenancePair[] {
  return values.map((value) => {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error(`Invalid --provenance ${value}; expected key=value.`);
    }
    return {
      key: value.slice(0, separator).trim(),
      value: value.slice(separator + 1).trim(),
    };
  });
}

function takeFlag(values: string[], flag: string): string | undefined {
  const index = values.indexOf(flag);
  if (index < 0) return undefined;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}.`);
  values.splice(index, 2);
  return value;
}

function takeBooleanFlag(values: string[], flag: string): boolean {
  const index = values.indexOf(flag);
  if (index < 0) return false;
  values.splice(index, 1);
  return true;
}

function takeRepeatedFlag(values: string[], flag: string): string[] {
  const results: string[] = [];
  for (;;) {
    const index = values.indexOf(flag);
    if (index < 0) return results;
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}.`);
    results.push(value);
    values.splice(index, 2);
  }
}

function renderBullets(items: string[], fallback: string) {
  if (items.length === 0) return `- ${fallback}`;
  return items.map((item) => `- ${item}`).join("\n");
}

function renderRelations(items: RelationHint[]) {
  if (items.length === 0) {
    return "- No explicit relation hints captured.";
  }
  return items.map((item) => `- ${item.type}: ${item.target}`).join("\n");
}

function renderSessionProvenance(provenance: ProvenanceFields, surface: string) {
  const rows: string[] = [`- Surface: ${surface}`];
  const fields: Array<[string, string | undefined]> = [
    ["Agent body", provenance.agentBody],
    ["Harness", provenance.harness],
    ["Harness version", provenance.harnessVersion],
    ["Session id", provenance.sessionId],
    ["Thread id", provenance.threadId],
    ["Run id", provenance.runId],
    ["Conversation id", provenance.conversationId],
    ["Task id", provenance.taskId],
    ["Transcript URI", provenance.transcriptUri],
    ["Model", provenance.model],
  ];

  for (const [label, value] of fields) {
    if (value) rows.push(`- ${label}: ${value}`);
  }
  for (const sourceRef of provenance.sourceRefs) {
    rows.push(`- Source ref: ${sourceRef}`);
  }
  for (const pair of provenance.custom) {
    rows.push(`- ${pair.key}: ${pair.value}`);
  }
  if (rows.length === 1) {
    rows.push("- No explicit session provenance supplied. Add safe source/session pointers when available; never dump broad environment variables.");
  }
  return rows.join("\n");
}

function renderNumbered(items: string[], fallback: string[]) {
  const values = items.length > 0 ? items : fallback;
  return values.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "context-crystal";
}

function compactTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function usage() {
  process.stdout.write(`agent-crystallize

Commands:
  agent-crystallize now [options] [summary]
  agent-crystallize checkpoint [options] [summary]
  agent-crystallize validate [options]
  agent-crystallize manifest [options]
  agent-crystallize hook [options]

Options:
  --repo <path>              Repo to crystallize; default cwd
  --out-dir <path>           Output dir relative to repo; default .agent-crystals/sessions or .agent-crystals/checkpoints
  --title <title>            Crystal title
  --scope <scope>            repo|project|product|cross-project|user|system; default project
  --project <slug>           Project/product slug; default repo basename
  --budget <mode>            fast|standard|deep; default standard for now, fast for checkpoint
  --surface <surface>        codex|claude-code|cli|hook; default cli
  --body <text>              Current focus body
  --stdin                    Read current focus body from stdin
  --topic <name>             Add a topic label; repeatable
  --tag <name>               Alias for --topic; repeatable
  --relation <type:target>   Add a lightweight relation hint; repeatable
  --agent-body <name>        Agent/body name, for example codex or claude-code
  --harness <name>           Harness/runtime name
  --harness-version <value>  Harness/runtime version
  --session-id <id>          Session id from the active agent harness
  --thread-id <id>           Thread id from the active agent harness
  --run-id <id>              Run id from the active agent harness
  --conversation-id <id>     Conversation id from the active agent harness
  --task-id <id>             Task id from the active agent harness
  --transcript-uri <uri>     Transcript/source URI or local path pointer
  --source-ref <ref>         Source pointer such as file:line or transcript range; repeatable
  --model <name>             Model name if safe and useful to record
  --provenance <key=value>   Extra safe provenance field; repeatable
  --decision <text>          Add a decision bullet; repeatable
  --finding <text>           Add a finding bullet; repeatable
  --open-loop <text>         Add an open-loop bullet; repeatable
  --test <text>              Add a test/verification bullet; repeatable
  --next-action <text>       Add a next-action item; repeatable
  --evidence <text>          Add an evidence pointer; repeatable
  --memory-candidate <text>  Add a memory-candidate bullet; repeatable
  --from-checkpoints latest  For 'now': include recent checkpoints as provenance anchors
  --checkpoint-dir <path>    Checkpoint dir relative to repo; default .agent-crystals/checkpoints

Validate options:
  --repo <path>              Repo to validate; default cwd
  --crystals-dir <path>      Crystals dir relative to repo; default .agent-crystals
  --files <path>             Validate only this Markdown crystal; repeatable
  --fail-on-warnings         Exit non-zero when warnings are present

Manifest options:
  --repo <path>              Repo to index; default cwd
  --crystals-dir <path>      Crystals dir relative to repo; default .agent-crystals
  --include-superseded       Include superseded artifacts in JSON output
  --write                    Write .agent-crystals/manifest.json

Hook options:
  --repo <path>                    Repo for local hook artifacts; default cwd or hook stdin cwd
  --harness <name>                 codex|claude-code|hook; default hook stdin harness or hook
  --event <name>                   SessionStart|UserPromptSubmit|PostToolUse|PostToolBatch|PreCompact|PostCompact|Stop
  --state-dir <path>               User-level hook state dir; default ~/.agent-crystallize/hooks
  --stop-checkpoint-ms <ms>        Stop cadence threshold; default 1500000
  --dedupe-window-ms <ms>          SessionStart/PostCompact dedupe window; default 600000
  --max-pointers <count>           SessionStart local artifact pointers; default 3
  --strict-precompact              Exit non-zero if PreCompact checkpoint fails
  --include-transcript-uri         Include transcript_path from hook stdin when supplied
`);
}
