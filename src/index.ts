#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkUpdates } from "./updates.js";
import { actions, applyAnnotations, writeAnnotation, withLifecycleLock, fingerprint, type Action } from "./lifecycle.js";

const args = process.argv.slice(2);
const command = args.shift();

const canonicalSections = [
  "Header",
  "Current Focus",
  "Durable Framing",
  "Checkpoint Trail",
  "Continuity Tail",
  "Topics",
  "Relation Hints",
  "Session Provenance",
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

const requiredSections = canonicalSections.filter(
  (section) => !["Continuity Tail", "Topics", "Relation Hints", "Session Provenance"].includes(section),
);

const hookEvents = ["SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolBatch", "PreCompact", "PostCompact", "Stop"] as const;
const managedStart = "<!-- agent-crystallize:context-persistence:start -->";
const managedEnd = "<!-- agent-crystallize:context-persistence:end -->";
const artifactProfileExcludeStart = "# agent-crystallize:artifact-profile:start";
const artifactProfileExcludeEnd = "# agent-crystallize:artifact-profile:end";
const legacyLocalExcludeStart = "# agent-crystallize:local-private:start";
const legacyLocalExcludeEnd = "# agent-crystallize:local-private:end";

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
  if (rest.includes("--help") || rest.includes("-h")) {
    usage();
    return undefined;
  }
  switch (name) {
    case "now":
      return crystallize(rest, "crystal");
    case "checkpoint":
      return crystallize(rest, "checkpoint");
    case "validate":
      return validate(rest);
    case "manifest":
      return manifest(rest);
    case "recall":
      return recall(rest);
    case "annotate":
      return annotate(rest);
    case "current-state":
      return currentState(rest);
    case "hook":
      return hook(rest);
    case "setup":
      return setup(rest);
    case "init":
      return init(rest);
    case "doctor":
      return doctor(rest);
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
type ArtifactProfile = "local-private" | "reviewed-shared";

type HookEvent = (typeof hookEvents)[number];

interface HookState {
  projects: Record<string, HookProjectState>;
}

interface HookProjectState {
  cwd: string;
  sessionKey?: string;
  lastActivityAt?: string;
  lastActivityEvent?: string;
  lastCheckpointAt?: string;
  lastCheckpointPath?: string;
  lastCheckpointEvent?: string;
  lastPreCompactAt?: string;
  lastSessionStartAt?: string;
  lastInjectedContextHash?: string;
  lastInjectedContextAt?: string;
  lastInjectedContextEvent?: string;
  lastPostCompactAt?: string;
  lastPostCompactContentHash?: string;
  lastPostCompactPromptBootstrapAt?: string;
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
  archived: boolean;
  consolidatedInto: string[];
  annotations: Array<{ id: string; action: string; reason: string; source: string; at: string; target?: string }>;
  lifecycleIssues: string[];
}

interface RecallResult {
  path: string;
  kind: ArtifactRecord["kind"];
  title: string;
  observedAt?: string;
  score: number;
  matched: string[];
  snippet: string;
}

interface FileAction {
  path: string;
  action: "created" | "updated" | "unchanged" | "would_create" | "would_update" | "would_skip" | "skipped";
  detail?: string;
}

interface RepoConfig {
  version: 1;
  project: string;
  artifactProfile: ArtifactProfile;
}

function setup(rest: string[]) {
  const dryRun = takeBooleanFlag(rest, "--dry-run");
  const force = takeBooleanFlag(rest, "--force");
  const upgrade = takeBooleanFlag(rest, "--upgrade");
  const all = takeBooleanFlag(rest, "--all");
  const codex = all || takeBooleanFlag(rest, "--codex");
  const claude = all || takeBooleanFlag(rest, "--claude");
  const hooks = takeBooleanFlag(rest, "--hooks");
  const skills = takeBooleanFlag(rest, "--skills");
  const protocolPath = resolve(expandHome(takeFlag(rest, "--protocol") ?? "~/.agents/context-persistence-protocol.md"));
  if (rest.length > 0) throw new Error(`Unexpected setup arguments: ${rest.join(" ")}`);

  const actions: FileAction[] = [];
  actions.push(writeIfChanged(protocolPath, renderProtocolFile(), { dryRun, force: force || upgrade, backupOnReplace: upgrade }));
  if (codex) {
    actions.push(
      upsertManagedBlock(resolve(homedir(), ".codex", "AGENTS.md"), renderHarnessPointer("Codex"), {
        dryRun,
        heading: "# Global Codex Instructions\n\n",
      }),
    );
  }
  if (claude) {
    actions.push(
      upsertManagedBlock(resolve(homedir(), ".claude", "CLAUDE.md"), renderHarnessPointer("Claude Code"), {
        dryRun,
        heading: "# Global Claude Code Instructions\n\n",
      }),
    );
  }
  if (skills) {
    const installCodexSkill = codex || all || (!codex && !claude);
    const installClaudeSkill = claude || all || (!codex && !claude);
    if (installCodexSkill) actions.push(...installSkill(resolve(homedir(), ".codex", "skills", "agent-context-crystallizer"), { dryRun, force: force || upgrade, backupOnReplace: upgrade }));
    if (installClaudeSkill) actions.push(...installSkill(resolve(homedir(), ".claude", "skills", "agent-context-crystallizer"), { dryRun, force: force || upgrade, backupOnReplace: upgrade }));
  }
  if (hooks) {
    actions.push({
      path: "docs/hooks.md",
      action: "skipped",
      detail:
        "Hook config is harness-specific and is not auto-written by setup v0. Review docs/hooks.md and examples/hooks before installing hooks.",
    });
  }

  return {
    ok: true,
    dryRun,
    protocolPath,
    codexConfigured: codex,
    claudeConfigured: claude,
    hooksRequested: hooks,
    skillsRequested: skills,
    actions,
    nextActions:
      codex || claude
        ? [
            "Run agent-crystallize doctor.",
            "Verify the agent harness can resolve the CLI (repo script, PATH, AGENT_CRYSTALLIZE_CLI, or a verified bundled runtime pointer).",
            "If hooks are configured or continuity feels broken, run agent-crystallize doctor --hooks and verify host /hooks.",
            "Run agent-crystallize init inside each repo that should keep local crystals.",
          ]
        : [
            "Run agent-crystallize setup --codex or --claude to add a thin global harness pointer.",
            "Run agent-crystallize init inside each repo that should keep local crystals.",
          ],
  };
}

async function init(rest: string[]) {
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
  const project = resolveProject(repo, takeFlag(rest, "--project"));
  const artifactProfile = resolveArtifactProfile(repo, takeFlag(rest, "--artifact-profile"));
  const dryRun = takeBooleanFlag(rest, "--dry-run");
  const noCheckpoint = takeBooleanFlag(rest, "--no-checkpoint");
  const noAgentsMd = takeBooleanFlag(rest, "--no-agents-md");
  const migrateExcludes = takeBooleanFlag(rest, "--migrate-excludes");
  const hooks = takeBooleanFlag(rest, "--hooks");
  const mind = takeBooleanFlag(rest, "--mind");
  if (rest.length > 0) throw new Error(`Unexpected init arguments: ${rest.join(" ")}`);
  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);

  const actions: FileAction[] = [];
  actions.push(ensureDirectory(resolve(repo, ".agent-crystals"), dryRun));
  actions.push(ensureDirectory(resolve(repo, ".agent-crystals", "checkpoints"), dryRun));
  actions.push(ensureDirectory(resolve(repo, ".agent-crystals", "sessions"), dryRun));
  actions.push(upsertRepoConfig(repo, project, artifactProfile, dryRun));
  actions.push(upsertLocalExclude(repo, artifactProfile, dryRun, migrateExcludes));
  if (!noAgentsMd) {
    actions.push(
      upsertManagedBlock(resolve(repo, "AGENTS.md"), renderRepoPointer(project), {
        dryRun,
        heading: "# Project Instructions\n\n",
      }),
    );
  }

  let checkpoint: Record<string, unknown> | undefined;
  let manifestResult: unknown;
  if (!dryRun) {
    if (!noCheckpoint) {
      checkpoint = (await crystallize(
        [
          "--repo",
          repo,
          "--project",
          project,
          "--scope",
          "project",
          "--budget",
          "fast",
          "--title",
          `Repo activation checkpoint - ${project} - ${formatDate(new Date())}`,
          "--topic",
          "agent-context-crystallization",
          "--topic",
          "repo-activation",
          "--decision",
          "Use local .agent-crystals artifacts as repo-scoped continuity checkpoints.",
          "--finding",
          "agent-crystallize init created the local artifact structure and private exclude patterns.",
          "--open-loop",
          "Review whether this repo should enable harness hooks after manual checkpoint flow is trusted.",
          "--test",
          "agent-crystallize init completed.",
          "--next-action",
          "Run agent-crystallize doctor before relying on this repo activation.",
          "--memory-candidate",
          "Repo activation is the handoff point from ad hoc notes to local-first context crystallization.",
          "--body",
          `Initialized agent-crystallize for ${project}. Local crystals are repo-scoped work context, not hidden chain-of-thought.`,
        ],
        "checkpoint",
      )) as Record<string, unknown>;
    }
    manifestResult = manifest(["--repo", repo, "--write"]);
  }
  if (hooks) {
    actions.push({
      path: "docs/hooks.md",
      action: "skipped",
      detail:
        "Hook installation is opt-in. Review docs/hooks.md and examples/hooks; setup v0 does not mutate harness hook config automatically.",
    });
  }

  return {
    ok: true,
    dryRun,
    repo,
    project,
    artifactProfile,
    actions,
    checkpoint,
    manifest: manifestResult,
    mindRequested: mind,
    mindNote: mind
      ? "An external memory system can import/link generated artifacts later. Public agent-crystallize stays local-file-only by default."
      : undefined,
  };
}

async function doctor(rest: string[]) {
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
  const codex = takeBooleanFlag(rest, "--codex");
  const claude = takeBooleanFlag(rest, "--claude");
  const hooks = takeBooleanFlag(rest, "--hooks");
  const updates = takeBooleanFlag(rest, "--updates");
  if (rest.length > 0) throw new Error(`Unexpected doctor arguments: ${rest.join(" ")}`);
  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);
  const repoConfig = readRepoConfig(repo);

  const checks = [
    checkPath("repo", repo, true),
    checkPath("repo:.agent-crystals", resolve(repo, ".agent-crystals"), true),
    checkPath("repo:.agent-crystals/checkpoints", resolve(repo, ".agent-crystals", "checkpoints"), true),
    checkPath("repo:.agent-crystals/sessions", resolve(repo, ".agent-crystals", "sessions"), true),
    checkRepoConfig(repo),
    checkPath("repo:.agent-crystals/manifest.json", resolve(repo, ".agent-crystals", "manifest.json"), false),
    checkPath("repo:AGENTS.md", resolve(repo, "AGENTS.md"), false),
    checkLocalExclude(repo, repoConfig?.artifactProfile ?? "local-private"),
    checkGeneratedFile("global:protocol", resolve(homedir(), ".agents", "context-persistence-protocol.md"), renderProtocolFile()),
  ];
  if (codex) {
    checks.push(checkManagedPointer("global:codex", resolve(homedir(), ".codex", "AGENTS.md")));
    checks.push(...checkInstalledSkill("global:codex-skill", resolve(homedir(), ".codex", "skills", "agent-context-crystallizer")));
  }
  if (claude) {
    checks.push(checkManagedPointer("global:claude", resolve(homedir(), ".claude", "CLAUDE.md")));
    checks.push(...checkInstalledSkill("global:claude-skill", resolve(homedir(), ".claude", "skills", "agent-context-crystallizer")));
  }
  if (hooks) checks.push(...checkHookConfig());
  const requiredFailed = checks.filter((check) => check.required && check.status !== "ok");
  const upgradeAvailable = checks.some((check) => check.status === "outdated_or_modified");
  return {
    ok: requiredFailed.length === 0,
    upgradeAvailable,
    updates: updates ? await checkUpdates({
      current: packageVersion(), source: installedSource(),
      cachePath: resolve(homedir(), ".cache", "agent-crystallize", "updates.json"),
    }) : undefined,
    repo,
    checks,
    nextActions:
      upgradeAvailable
        ? ["Review differences, then run agent-crystallize setup --upgrade with the same --codex/--claude/--skills targets. Previous generated files are backed up before replacement."]
        : requiredFailed.length === 0
        ? hooks
          ? [
              "Codex: open /hooks after installing or changing hooks, then review and trust changed hook definitions.",
              "Claude Code: open /hooks and use transcript/debug logs to verify hook visibility and failures.",
              "If hook trust is unknown, keep using manual agent-crystallize checkpoint/now before compaction or handoff.",
            ]
          : ["Use agent-crystallize checkpoint during long work and agent-crystallize now before handoff or compaction."]
        : ["Run agent-crystallize init in this repo; preserve custom global instructions and pointers."],
  };
}

async function crystallize(rest: string[], kind: ArtifactKind) {
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
  const artifactProfile = resolveArtifactProfile(repo);
  const budget = takeFlag(rest, "--budget") ?? (kind === "checkpoint" ? "fast" : "standard");
  const scope = takeFlag(rest, "--scope") ?? "project";
  const project = resolveProject(repo, takeFlag(rest, "--project"));
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
  const continuityTailMaxChars = Number(takeFlag(rest, "--continuity-tail-max-chars") ?? 12000);
  const continuityTailSource = takeFlag(rest, "--continuity-tail-source") ?? "cli";
  const structured = takeStructuredFields(rest, continuityTailSource);
  const outDir = resolve(repo, takeFlag(rest, "--out-dir") ?? (kind === "checkpoint" ? ".agent-crystals/checkpoints" : ".agent-crystals/sessions"));
  const unknownFlags = rest.filter((value) => value.startsWith("--"));
  if (unknownFlags.length > 0) {
    throw new Error(`Unexpected ${kind} arguments: ${unknownFlags.join(" ")}`);
  }
  const body = bodyFlag ?? (readStdin ? await readStdinBody() : rest.join(" ").trim());

  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);
  if (!["fast", "standard", "deep"].includes(budget)) {
    throw new Error(`Invalid --budget ${budget}; expected fast, standard, or deep.`);
  }
  if (!Number.isFinite(continuityTailMaxChars) || continuityTailMaxChars < 0) {
    throw new Error("--continuity-tail-max-chars must be a non-negative number.");
  }
  structured.continuityTailMaxChars = continuityTailMaxChars;
  structured.continuityTail = boundContinuityTail(structured.continuityTail, continuityTailMaxChars);
  if (fromCheckpoints && fromCheckpoints !== "latest") {
    throw new Error(`Invalid --from-checkpoints ${fromCheckpoints}; expected latest.`);
  }

  const observedAt = new Date();
  const git = collectGitContext(repo);
  if (artifactProfile === "reviewed-shared" && git.root) git.root = ".";
  const checkpointTrail =
    kind === "crystal" && fromCheckpoints === "latest"
      ? collectCheckpointTrail(repo, checkpointDir ?? ".agent-crystals/checkpoints")
      : [];
  const instructionFiles = ["AGENTS.md", "CLAUDE.md", "docs/context/WARM_START.md"].filter((path) =>
    existsSync(resolve(repo, path)),
  );
  const filename = `${compactTimestamp(observedAt)}-${slugify(title)}.md`;
  mkdirSync(outDir, { recursive: true });
  const path = reserveExclusiveArtifactPath(outDir, filename);
  const finalRelativePath = relative(repo, path);
  const markdown = renderCrystal({
    kind,
    title,
    scope,
    project,
    budget,
    repo: artifactProfile === "reviewed-shared" ? "." : repo,
    surface,
    observedAt,
    body,
    structured,
    git,
    checkpointTrail,
    instructionFiles,
    outputRelativePath: finalRelativePath,
  });
  writeFileSync(path, markdown, "utf8");

  const result: Record<string, unknown> = {
    ok: true,
    path,
    relativePath: finalRelativePath,
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
  const input = await readJsonStdinIfAvailable();
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? stringField(input, "cwd") ?? process.cwd());
  const harness = takeFlag(rest, "--harness") ?? stringField(input, "harness") ?? "hook";
  const event = (takeFlag(rest, "--event") ?? stringField(input, "hook_event_name") ?? stringField(input, "event") ?? "SessionStart") as HookEvent;
  const stateDir = resolve(takeFlag(rest, "--state-dir") ?? join(homedir(), ".agent-crystallize", "hooks"));
  const stopCheckpointMs = Number(takeFlag(rest, "--stop-checkpoint-ms") ?? 25 * 60 * 1000);
  const dedupeWindowMs = Number(takeFlag(rest, "--dedupe-window-ms") ?? 10 * 60 * 1000);
  const strictPrecompact = takeBooleanFlag(rest, "--strict-precompact");
  const maxPointers = Number(takeFlag(rest, "--max-pointers") ?? 3);
  const includeTranscriptUri = takeBooleanFlag(rest, "--include-transcript-uri");
  const noContinuityTail = takeBooleanFlag(rest, "--no-continuity-tail");
  const continuityTailMaxChars = Number(takeFlag(rest, "--continuity-tail-max-chars") ?? 12000);
  if (rest.length > 0) {
    throw new Error(`Unexpected hook arguments: ${rest.join(" ")}`);
  }
  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);
  if (!Number.isFinite(stopCheckpointMs) || stopCheckpointMs < 0) throw new Error("--stop-checkpoint-ms must be a non-negative number.");
  if (!Number.isFinite(dedupeWindowMs) || dedupeWindowMs < 0) throw new Error("--dedupe-window-ms must be a non-negative number.");
  if (!Number.isFinite(maxPointers) || maxPointers < 1) throw new Error("--max-pointers must be a positive number.");
  if (!Number.isFinite(continuityTailMaxChars) || continuityTailMaxChars < 0) {
    throw new Error("--continuity-tail-max-chars must be a non-negative number.");
  }
  if (!isHookEvent(event)) throw new Error(`Invalid --event ${event}; expected one of ${hookEvents.join(", ")}.`);
  const continuityTail = noContinuityTail ? [] : extractContinuityTailFromHookInput(input, continuityTailMaxChars);

  const statePath = join(stateDir, "state.json");
  return withStateLock(statePath, async () => {
    const state = loadHookState(statePath);
    const sessionId = stringField(input, "session_id") ?? stringField(input, "sessionId");
    const sessionKey = sessionId ? stableKey(sessionId) : "session-unavailable";
    const key = sessionId ? stableKey(`${repo}\n${sessionId}`) : stableKey(repo);
    const projectState = state.projects[key] ?? { cwd: repo, sessionKey };
    projectState.cwd = repo;
    projectState.sessionKey = sessionKey;

    const save = () => {
      state.projects[key] = projectState;
      saveHookState(statePath, state);
    };

    switch (event) {
      case "SessionStart": {
        const context = renderSessionStartContext(repo, harness, projectState, maxPointers, dedupeWindowMs);
        const fullContextHash = stableKey(context.fullContext);
        const injectedAt = new Date().toISOString();
        projectState.lastSessionStartAt = injectedAt;
        projectState.lastInjectedContextHash = fullContextHash;
        projectState.lastInjectedContextAt = injectedAt;
        projectState.lastInjectedContextEvent = event;
        const lastPostCompact = projectState.lastPostCompactAt ? Date.parse(projectState.lastPostCompactAt) : 0;
        if (lastPostCompact > 0 && Date.parse(injectedAt) >= lastPostCompact) {
          projectState.lastPostCompactPromptBootstrapAt = injectedAt;
        }
        save();
        outputHookContext(harness, event, context.output);
        return undefined;
      }
      case "UserPromptSubmit": {
        projectState.lastActivityAt = new Date().toISOString();
        projectState.lastActivityEvent = event;
        const lastPostCompact = projectState.lastPostCompactAt ? Date.parse(projectState.lastPostCompactAt) : 0;
        const lastPromptBootstrap = projectState.lastPostCompactPromptBootstrapAt
          ? Date.parse(projectState.lastPostCompactPromptBootstrapAt)
          : 0;
        if (lastPostCompact > lastPromptBootstrap) {
          const context = renderSessionStartContext(repo, harness, projectState, maxPointers, dedupeWindowMs).fullContext;
          projectState.lastInjectedContextHash = stableKey(context);
          projectState.lastInjectedContextAt = new Date().toISOString();
          projectState.lastInjectedContextEvent = event;
          projectState.lastPostCompactPromptBootstrapAt = projectState.lastInjectedContextAt;
          save();
          outputHookContext(
            harness,
            event,
            [
              "agent-crystallize post-compact bootstrap fallback:",
              "A PostCompact hook ran since the last prompt-level compact bootstrap.",
              context,
            ].join("\n"),
          );
          return undefined;
        }
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
            continuityTail,
            continuityTailMaxChars,
            body: [
              "Pre-compact checkpoint requested by lifecycle hook.",
              `Trigger: ${redactSensitiveText(stringField(input, "trigger") ?? "unknown")}.`,
              stringField(input, "custom_instructions")
                ? `Custom compact instructions: ${excerpt(redactSensitiveText(stringField(input, "custom_instructions") ?? ""), 1000)}.`
                : undefined,
              `Last activity: ${projectState.lastActivityAt ?? "unknown"}.`,
              "Purpose: preserve high-signal work state before lossy context compaction.",
            ]
              .filter(Boolean)
              .join("\n"),
            decision: "PreCompact is a lifecycle boundary; write a local checkpoint before compaction proceeds.",
            finding: "Hook-created checkpoints are local-first artifacts and do not require any external memory service.",
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
      const now = new Date().toISOString();
      const compactSummary = redactSensitiveText(stringField(input, "compact_summary") ?? "");
      const postCompactContentHash = stableKey(`${normalizeForHash(compactSummary)}\n${JSON.stringify(continuityTail)}`);
      const lastPostCompact = projectState.lastPostCompactAt ? Date.parse(projectState.lastPostCompactAt) : 0;
      const repeatedPostCompact =
        projectState.lastPostCompactContentHash === postCompactContentHash &&
        lastPostCompact > 0 &&
        Date.now() - lastPostCompact <= dedupeWindowMs;
      const lastPreCompact = projectState.lastPreCompactAt ? Date.parse(projectState.lastPreCompactAt) : 0;
      if (lastPreCompact > 0 && Date.now() - lastPreCompact <= dedupeWindowMs) {
        if (compactSummary && !repeatedPostCompact) {
            const checkpoint = await createHookCheckpoint({
              repo,
              harness,
              event,
              input,
              includeTranscriptUri,
              continuityTail,
              continuityTailMaxChars,
              body: [
                "Post-compact summary delta captured after a recent PreCompact checkpoint.",
                `Trigger: ${redactSensitiveText(stringField(input, "trigger") ?? "unknown")}.`,
                `Compact summary: ${excerpt(compactSummary, 2000)}`,
              ].join("\n"),
              decision: "Preserve a supplied PostCompact summary as append-only evidence instead of silently discarding it.",
              finding: "A recent PreCompact checkpoint exists; this artifact records only the later compact-summary delta.",
              openLoop: "Verify the richer PreCompact checkpoint before treating this lossy summary as authoritative.",
              nextAction: "Resume from the recent PreCompact checkpoint, using this delta only for post-compact context.",
              relation: projectState.lastCheckpointPath ? `relates_to:${projectState.lastCheckpointPath}` : undefined,
            });
            projectState.lastCheckpointAt = now;
            projectState.lastCheckpointPath = stringRecordField(checkpoint, "relativePath");
            projectState.lastCheckpointEvent = event;
          }
          const context = renderSessionStartContext(repo, harness, projectState, maxPointers, dedupeWindowMs).fullContext;
          projectState.lastActivityAt = now;
        projectState.lastActivityEvent = event;
        projectState.lastPostCompactAt = now;
        projectState.lastPostCompactContentHash = postCompactContentHash;
          if (canInjectHookContext(harness, event)) {
            projectState.lastInjectedContextHash = stableKey(context);
            projectState.lastInjectedContextAt = now;
            projectState.lastInjectedContextEvent = event;
          }
          save();
          outputHookContext(
            harness,
            event,
            [
              "agent-crystallize post-compact bootstrap:",
            compactSummary
              ? repeatedPostCompact
                ? "The same PostCompact summary was already preserved recently, so no duplicate delta was written."
                : "A recent PreCompact checkpoint exists; the supplied compact summary was preserved as a bounded delta checkpoint."
                : "A recent PreCompact checkpoint already exists, so no duplicate checkpoint was written.",
              context,
            ].join("\n"),
          );
          return undefined;
        }
        const checkpoint = await createHookCheckpoint({
          repo,
          harness,
          event,
          input,
          includeTranscriptUri,
          continuityTail,
          continuityTailMaxChars,
          body: [
            "Post-compact summary captured by lifecycle hook.",
            `Trigger: ${redactSensitiveText(stringField(input, "trigger") ?? "unknown")}.`,
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
      projectState.lastPostCompactAt = projectState.lastCheckpointAt;
      projectState.lastPostCompactContentHash = postCompactContentHash;
        const context = renderSessionStartContext(repo, harness, projectState, maxPointers, dedupeWindowMs).fullContext;
        if (canInjectHookContext(harness, event)) {
          projectState.lastInjectedContextHash = stableKey(context);
          projectState.lastInjectedContextAt = projectState.lastCheckpointAt;
          projectState.lastInjectedContextEvent = event;
        }
        save();
        outputHookContext(
          harness,
          event,
          [
            "agent-crystallize post-compact bootstrap:",
            "A PostCompact checkpoint was written because no recent PreCompact checkpoint was found.",
            context,
          ].join("\n"),
        );
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
            continuityTail,
            continuityTailMaxChars,
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
  });
}

async function createHookCheckpoint(input: {
  repo: string;
  harness: string;
  event: HookEvent;
  input: Record<string, unknown>;
  includeTranscriptUri: boolean;
  continuityTail: ContinuityTailEntry[];
  continuityTailMaxChars: number;
  body: string;
  decision: string;
  finding: string;
  openLoop: string;
  nextAction: string;
  relation?: string;
}) {
  const project = resolveProject(input.repo);
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
  if (input.relation) args.push("--relation", input.relation);
  const sessionId = stringField(input.input, "session_id") ?? stringField(input.input, "sessionId");
  if (sessionId) args.push("--session-id", sessionId);
  const transcriptUri = stringField(input.input, "transcript_path") ?? stringField(input.input, "transcriptUri");
  if (input.includeTranscriptUri && transcriptUri) args.push("--transcript-uri", transcriptUri);
  if (input.continuityTail.length > 0) {
    args.push("--continuity-tail-max-chars", String(input.continuityTailMaxChars));
    args.push("--continuity-tail-source", "hook-stdin");
    for (const entry of input.continuityTail) {
      const timestamp = entry.timestamp ? `[${entry.timestamp}] ` : "";
      args.push("--continuity-tail", `${timestamp}${entry.role}: ${entry.content}`);
    }
  }
  args.push("--body", input.body);
  return crystallize(args, "checkpoint");
}

async function readJsonStdinIfAvailable(): Promise<Record<string, unknown>> {
  if (process.stdin.isTTY) return {};
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch (error) {
    throw new Error(`Unable to read hook JSON from stdin: ${error instanceof Error ? error.message : String(error)}`);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid hook JSON on stdin: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractContinuityTailFromHookInput(input: Record<string, unknown>, maxChars: number): ContinuityTailEntry[] {
  const candidates =
    arrayField(input, "continuity_tail") ??
    arrayField(input, "continuityTail") ??
    arrayField(input, "messages") ??
    arrayField(input, "conversation") ??
    [];
  const entries: ContinuityTailEntry[] = [];
  for (const candidate of candidates.slice(-24)) {
    if (typeof candidate === "string") {
      entries.push(parseContinuityTailEntry(candidate, "hook-stdin"));
      continue;
    }
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const role = stringField(record, "role") ?? stringField(record, "speaker") ?? stringField(record, "type") ?? "message";
    const content =
      stringField(record, "content") ??
      stringField(record, "text") ??
      stringField(record, "message") ??
      stringField(record, "body");
    if (!content) continue;
    entries.push(
      makeContinuityTailEntry({
        role,
        content,
        timestamp: stringField(record, "timestamp") ?? stringField(record, "created_at") ?? stringField(record, "time"),
        id: stringField(record, "id") ?? stringField(record, "turn_id") ?? stringField(record, "message_id"),
        source: "hook-stdin",
      }),
    );
  }
  return boundContinuityTail(entries, maxChars);
}

function arrayField(input: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = input[key];
  return Array.isArray(value) ? value : undefined;
}

function loadHookState(path: string): HookState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && parsed.projects && typeof parsed.projects === "object" ? parsed : { projects: {} };
  } catch {
    return { projects: {} };
  }
}

async function withStateLock<T>(statePath: string, action: () => Promise<T>): Promise<T> {
  mkdirSync(dirname(statePath), { recursive: true });
  const lockPath = `${statePath}.lock`;
  const owner = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const deadline = Date.now() + 5000;

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, `${owner}\n`, "utf8");
      closeSync(fd);
      break;
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for hook state lock: ${lockPath}`);
      }
      await delay(20);
    }
  }

  try {
    return await action();
  } finally {
    try {
      if (readFileSync(lockPath, "utf8").trim() === owner) unlinkSync(lockPath);
    } catch {
      // A missing lock is observable through the failed state operation, not fatal cleanup.
    }
  }
}

function saveHookState(path: string, state: HookState) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function delay(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function isNodeError(error: unknown, code: string) {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

function renderSessionStartContext(
  repo: string,
  harness: string,
  state: HookProjectState,
  maxPointers: number,
  dedupeWindowMs: number,
) {
  const activeArtifacts = collectArtifactRecords(repo, ".agent-crystals").filter(isValidActiveArtifact);
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
  lines.push("- If an external memory or index layer is configured by your harness, use it as an optional pointer/index layer; agent-crystallize remains the local artifact writer.");
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

function canInjectHookContext(harness: string, event: HookEvent) {
  return harness !== "claude-code" || event === "SessionStart" || event === "UserPromptSubmit";
}

function outputHookContext(harness: string, event: HookEvent, context: string) {
  if (!canInjectHookContext(harness, event)) return false;
  if (harness === "claude-code") {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: context,
        },
        suppressOutput: true,
      })}\n`,
    );
    return true;
  }
  process.stdout.write(`${context}\n`);
  return true;
}

function stableKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function resolveRepoRoot(candidate: string) {
  const resolved = resolve(candidate);
  return git(resolved, ["rev-parse", "--show-toplevel"]) ?? resolved;
}

function reserveExclusiveArtifactPath(outDir: string, filename: string) {
  const extension = filename.endsWith(".md") ? ".md" : "";
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const candidate = resolve(outDir, suffix === 1 ? filename : `${stem}-${suffix}${extension}`);
    try {
      const fd = openSync(candidate, "wx");
      closeSync(fd);
      return candidate;
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
    }
  }
  throw new Error(`Unable to reserve a unique artifact path for ${filename}.`);
}

function normalizeForHash(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeRole(value: string) {
  const role = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return role || "message";
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\b(npm_[A-Za-z0-9]{20,})\b/g, "[REDACTED_NPM_TOKEN]")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, "$1[REDACTED]")
    .replace(
      /\b([A-Za-z][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_?KEY|ACCESS_?KEY)[A-Za-z0-9_]*)\s*[:=]\s*["']?[^"'\s,;]{4,}/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b(authorization|api[_-]?key|token|secret|password|cookie)\b\s*[:=]\s*["']?[^"'\s,;]{8,}/gi, "$1=[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_JWT]");
}

function indentContinuation(value: string) {
  return value
    .split("\n")
    .map((line) => (line.trim() ? line : ""))
    .join("\n  ");
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

function expandHome(path: string) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function ensureDirectory(path: string, dryRun: boolean): FileAction {
  if (existsSync(path)) return { path, action: "unchanged", detail: "directory exists" };
  if (dryRun) return { path, action: "would_create", detail: "directory" };
  mkdirSync(path, { recursive: true });
  return { path, action: "created", detail: "directory" };
}

function writeIfChanged(
  path: string,
  content: string,
  options: { dryRun: boolean; force: boolean; backupOnReplace?: boolean },
): FileAction {
  const exists = existsSync(path);
  if (exists) {
    const current = readFileSync(path, "utf8");
    if (current === content) return { path, action: "unchanged" };
    if (!options.force) {
      return {
        path,
        action: options.dryRun ? "would_skip" : "skipped",
        detail: "file exists; pass --force to replace it",
      };
    }
  }
  if (options.dryRun) return { path, action: exists ? "would_update" : "would_create" };
  mkdirSync(dirname(path), { recursive: true });
  const backupPath = exists && options.backupOnReplace ? writeUpgradeBackup(path, readFileSync(path, "utf8")) : undefined;
  writeFileSync(path, content, "utf8");
  return { path, action: exists ? "updated" : "created", detail: backupPath ? `previous file preserved at ${backupPath}` : undefined };
}

function writeUpgradeBackup(path: string, content: string) {
  const timestamp = compactTimestamp(new Date());
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const candidate = `${path}.pre-agent-crystallize-upgrade-${timestamp}${suffix === 1 ? "" : `-${suffix}`}.bak`;
    try {
      const fd = openSync(candidate, "wx");
      writeFileSync(fd, content, "utf8");
      closeSync(fd);
      return candidate;
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
    }
  }
  throw new Error(`Unable to preserve an upgrade backup for ${path}.`);
}

function installSkill(
  targetDir: string,
  options: { dryRun: boolean; force: boolean; backupOnReplace?: boolean },
): FileAction[] {
  const sourceDir = resolve(packageRoot(), "skills", "agent-context-crystallizer");
  const files = [
    ["SKILL.md", "SKILL.md"],
    [join("agents", "openai.yaml"), join("agents", "openai.yaml")],
  ];
  return files.map(([sourceRelative, targetRelative]) => {
    const sourcePath = resolve(sourceDir, sourceRelative);
    const targetPath = resolve(targetDir, targetRelative);
    if (!existsSync(sourcePath)) {
      return {
        path: targetPath,
        action: "skipped",
        detail: `source skill file missing from package: ${sourcePath}`,
      };
    }
    return writeIfChanged(targetPath, readFileSync(sourcePath, "utf8"), options);
  });
}

function checkGeneratedFile(name: string, path: string, expected: string) {
  if (!existsSync(path)) return { name, path, required: false, status: "missing_optional" };
  const current = readFileSync(path, "utf8");
  const canonicalSkill = "~/.agents/skills/agent-context-crystallizer/SKILL.md";
  const pointer = path.endsWith("SKILL.md") && current.includes(canonicalSkill);
  const targetExists = pointer && existsSync(resolve(homedir(), ".agents", "skills", "agent-context-crystallizer", "SKILL.md"));
  const generated = /^Distribution: agent-crystallize\//m.test(current) ||
    current.startsWith("---\nname: agent-context-crystallizer\n") && current.includes("## Resolve The CLI Before Writing");
  const status = current === expected ? "ok" : pointer
    ? targetExists ? "custom_pointer" : "broken_pointer"
    : generated ? "outdated_or_modified" : "custom_or_unrecognized";
  return {
    name,
    path,
    required: false,
    status,
    detail: status === "ok" ? undefined : status === "outdated_or_modified"
      ? "Recognizable package template differs; review custom edits before setup --upgrade."
      : status === "broken_pointer" ? "Canonical skill target is missing; repair the pointer before relying on it."
      : "Custom or unrecognized configuration; preserve it and review manually. Template difference alone does not establish an available upgrade.",
  };
}

function checkInstalledSkill(name: string, targetDir: string) {
  const sourceDir = resolve(packageRoot(), "skills", "agent-context-crystallizer");
  return [
    ["SKILL.md", "SKILL.md"],
    [join("agents", "openai.yaml"), join("agents", "openai.yaml")],
  ].map(([sourceRelative, targetRelative]) => {
    const source = resolve(sourceDir, sourceRelative);
    const target = resolve(targetDir, targetRelative);
    return checkGeneratedFile(`${name}:${targetRelative.replace(/\\/g, "/")}`, target, readFileSync(source, "utf8"));
  });
}

function packageRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function packageVersion() {
  const parsed = JSON.parse(readFileSync(resolve(packageRoot(), "package.json"), "utf8")) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version : "unknown";
}

function installedSource(): "registry" | "local" | "unknown" {
  if (existsSync(resolve(packageRoot(), ".git"))) return "local";
  try {
    const lock = JSON.parse(readFileSync(resolve(packageRoot(), "../../..", "package-lock.json"), "utf8"));
    const resolved = lock.packages?.["node_modules/@stewie-sh/agent-crystallize"]?.resolved;
    if (typeof resolved === "string") {
      if (resolved.startsWith("https://registry.npmjs.org/")) return "registry";
      return "local";
    }
  } catch { /* Install provenance is not always available. */ }
  return "unknown";
}

function upsertManagedBlock(path: string, block: string, options: { dryRun: boolean; heading: string }): FileAction {
  const managed = `${managedStart}\n${block.trim()}\n${managedEnd}\n`;
  const exists = existsSync(path);
  const current = exists ? readFileSync(path, "utf8") : "";
  const next = current.includes(managedStart) && current.includes(managedEnd)
    ? current.replace(new RegExp(`${escapeRegex(managedStart)}[\\s\\S]*?${escapeRegex(managedEnd)}\\n?`), managed)
    : `${exists ? current.replace(/\s*$/u, "\n\n") : options.heading}${managed}`;
  if (current === next) return { path, action: "unchanged" };
  if (options.dryRun) return { path, action: exists ? "would_update" : "would_create" };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, "utf8");
  return { path, action: exists ? "updated" : "created" };
}

function resolveProject(repo: string, explicitProject?: string) {
  if (explicitProject !== undefined) return normalizeProject(explicitProject);
  const configPath = resolve(repo, ".agent-crystals", "config.json");
  const config = readRepoConfig(repo);
  if (existsSync(configPath) && !config) {
    throw new Error(`Invalid repo config: ${configPath}. Repair it with agent-crystallize init --project <slug>.`);
  }
  return config?.project ?? (basename(repo) || "project");
}

function resolveArtifactProfile(repo: string, explicitProfile?: string): ArtifactProfile {
  if (explicitProfile !== undefined) return normalizeArtifactProfile(explicitProfile);
  return readRepoConfig(repo)?.artifactProfile ?? "local-private";
}

function normalizeProject(project: string) {
  const normalized = project.trim();
  if (!normalized) throw new Error("Project name must not be empty.");
  if (/\r|\n/.test(normalized)) throw new Error("Project name must fit on one line.");
  return normalized;
}

function normalizeArtifactProfile(profile: string): ArtifactProfile {
  if (profile === "local-private" || profile === "reviewed-shared") return profile;
  throw new Error("Artifact profile must be local-private or reviewed-shared.");
}

function readRepoConfig(repo: string): RepoConfig | undefined {
  const path = resolve(repo, ".agent-crystals", "config.json");
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<RepoConfig>;
    if (parsed.version !== 1 || typeof parsed.project !== "string") return undefined;
    return {
      version: 1,
      project: normalizeProject(parsed.project),
      artifactProfile: normalizeArtifactProfile(parsed.artifactProfile ?? "local-private"),
    };
  } catch {
    return undefined;
  }
}

function upsertRepoConfig(repo: string, project: string, artifactProfile: ArtifactProfile, dryRun: boolean): FileAction {
  const path = resolve(repo, ".agent-crystals", "config.json");
  const existed = existsSync(path);
  const content = `${JSON.stringify({ version: 1, project, artifactProfile } satisfies RepoConfig, null, 2)}\n`;
  const current = existed ? readFileSync(path, "utf8") : "";
  if (current === content) return { path, action: "unchanged" };
  if (dryRun) return { path, action: existed ? "would_update" : "would_create" };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return { path, action: existed ? "updated" : "created" };
}

function renderArtifactProfileExclude(artifactProfile: ArtifactProfile, retainLegacyBroadProtections = false) {
  const artifactPatterns =
    artifactProfile === "local-private"
      ? [".agent-crystals/"]
      : [".agent-crystals/checkpoints/", ".agent-crystals/annotations/", ".agent-crystals/manifest.json", ".agent-crystals/config.json"];
  const legacyPatterns = retainLegacyBroadProtections
    ? [
        "",
        "# retained legacy protections; review before removing with init --migrate-excludes",
        ".local/",
        ".private/",
        "private/",
        "docs/private/",
        "docs/internal/",
        "*.private.md",
        "*.internal.md",
      ]
    : [];
  return `${artifactProfileExcludeStart}
# profile: ${artifactProfile}
${artifactPatterns.join("\n")}
${legacyPatterns.join("\n")}
${artifactProfileExcludeEnd}
`;
}

function replaceArtifactProfileExclude(current: string, block: string) {
  const markers = [
    [artifactProfileExcludeStart, artifactProfileExcludeEnd],
    [legacyLocalExcludeStart, legacyLocalExcludeEnd],
  ];
  let next = current;
  let replaced = false;
  for (const [start, end] of markers) {
    if (!next.includes(start) || !next.includes(end)) continue;
    next = next.replace(new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}\\n?`), replaced ? "" : block);
    replaced = true;
  }
  return replaced ? next : `${current.replace(/\s*$/u, "\n")}\n${block}`;
}

function upsertLocalExclude(repo: string, artifactProfile: ArtifactProfile, dryRun: boolean, migrateExcludes = false): FileAction {
  const path = resolveGitExcludePath(repo);
  if (!path) {
    return {
      path: resolve(repo, ".git", "info", "exclude"),
      action: "skipped",
      detail: "not a git repository; local private exclude not written",
    };
  }
  const existed = existsSync(path);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const currentManagedBlock = findArtifactProfileExclude(current);
  const retainLegacyBroadProtections = !migrateExcludes && hasLegacyBroadProtections(currentManagedBlock);
  const block = renderArtifactProfileExclude(artifactProfile, retainLegacyBroadProtections);
  const next = replaceArtifactProfileExclude(current, block);
  const detail = retainLegacyBroadProtections
    ? "legacy broad protections retained; review before rerunning init --migrate-excludes"
    : undefined;
  if (current === next) return { path, action: "unchanged", detail };
  if (dryRun) return { path, action: existed ? "would_update" : "would_create", detail };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, "utf8");
  return { path, action: existed ? "updated" : "created", detail };
}

function hasLegacyBroadProtections(block: string | undefined) {
  return Boolean(block && /^(?:\.local\/|\.private\/|private\/|docs\/private\/|docs\/internal\/|\*\.private\.md|\*\.internal\.md)$/m.test(block));
}

function checkPath(name: string, path: string, required: boolean) {
  return {
    name,
    path,
    required,
    status: existsSync(path) ? "ok" : required ? "missing" : "missing_optional",
  };
}

function checkRepoConfig(repo: string) {
  const path = resolve(repo, ".agent-crystals", "config.json");
  if (!existsSync(path)) {
    return { name: "repo:.agent-crystals/config.json", path, required: true, status: "missing" };
  }
  const config = readRepoConfig(repo);
  return {
    name: "repo:.agent-crystals/config.json",
    path,
    required: true,
    status: config ? "ok" : "invalid",
    detail: config
      ? `project=${config.project}; artifactProfile=${config.artifactProfile}`
      : "expected { version: 1, project: <non-empty one-line string>, artifactProfile?: local-private|reviewed-shared }",
  };
}

function findArtifactProfileExclude(body: string) {
  for (const [start, end] of [
    [artifactProfileExcludeStart, artifactProfileExcludeEnd],
    [legacyLocalExcludeStart, legacyLocalExcludeEnd],
  ]) {
    const match = body.match(new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}\\n?`));
    if (match) return match[0];
  }
  return undefined;
}

function checkLocalExclude(repo: string, artifactProfile: ArtifactProfile) {
  const path = resolveGitExcludePath(repo) ?? resolve(repo, ".git", "info", "exclude");
  const body = existsSync(path) ? readFileSync(path, "utf8") : "";
  const managedBlock = findArtifactProfileExclude(body);
  const expectedBlock = renderArtifactProfileExclude(artifactProfile);
  const retainedLegacy = hasLegacyBroadProtections(managedBlock);
  return {
    name: "repo:git-info-exclude",
    path,
    required: false,
    status:
      managedBlock === expectedBlock
        ? "ok"
        : retainedLegacy
          ? "legacy_protections_retained"
          : managedBlock
            ? "profile_mismatch"
            : "missing_optional",
    detail: retainedLegacy
      ? `artifactProfile=${artifactProfile}; broad legacy protections retained until explicit init --migrate-excludes`
      : `artifactProfile=${artifactProfile}`,
  };
}

function resolveGitExcludePath(repo: string) {
  const path = git(repo, ["rev-parse", "--git-path", "info/exclude"]);
  if (!path) return undefined;
  return isAbsolute(path) ? path : resolve(repo, path);
}

function checkManagedPointer(name: string, path: string) {
  const body = existsSync(path) ? readFileSync(path, "utf8") : "";
  const customPointer = body.includes("~/.agents/context-persistence-protocol.md");
  const customTargetExists = existsSync(resolve(homedir(), ".agents", "context-persistence-protocol.md"));
  return {
    name,
    path,
    required: false,
    status: body.includes(managedStart) && body.includes("agent-crystallize") ? "ok"
      : customPointer ? customTargetExists ? "custom_pointer" : "broken_pointer"
      : existsSync(path) ? "missing_pointer" : "missing_optional",
  };
}

function checkHookConfig() {
  const codexHooksJson = resolve(homedir(), ".codex", "hooks.json");
  const codexConfigToml = resolve(homedir(), ".codex", "config.toml");
  const claudeSettingsJson = resolve(homedir(), ".claude", "settings.json");
  const claudeSettingsLocalJson = resolve(homedir(), ".claude", "settings.local.json");
  return [
    checkHookConfigFile("hooks:codex:hooks-json", codexHooksJson, "codex"),
    checkHookConfigFile("hooks:codex:config-toml", codexConfigToml, "codex"),
    checkHookConfigFile("hooks:claude:settings-json", claudeSettingsJson, "claude-code"),
    checkHookConfigFile("hooks:claude:settings-local-json", claudeSettingsLocalJson, "claude-code"),
  ];
}

function checkHookConfigFile(name: string, path: string, harness: string) {
  if (!existsSync(path)) {
    return {
      name,
      path,
      required: false,
      status: "missing_optional",
      detail: "No hook config file found at this path.",
    };
  }
  const body = readFileSync(path, "utf8");
  const hasAgentCrystallize = body.includes("agent-crystallize");
  if (!hasAgentCrystallize) {
    return {
      name,
      path,
      required: false,
      status: "missing_optional",
      detail: "Config exists, but no agent-crystallize hook command was found.",
    };
  }
  return {
    name,
    path,
    required: false,
    status: "needs_harness_verification",
    detail:
      harness === "codex"
        ? "agent-crystallize hook config found. Codex trust is host-internal: open /hooks and trust new or changed hook definitions before relying on them."
        : "agent-crystallize hook config found. Verify visibility and failures with Claude Code /hooks and debug logs before relying on hooks.",
  };
}

function renderProtocolFile() {
  return `# Context Persistence Protocol

Protocol: agent-context-crystallization/0.1
Distribution: agent-crystallize/${packageVersion()}

This file is a thin user-level pointer for local-first agent context persistence.

## Core Rules

- Preserve durable work context, not hidden chain-of-thought.
- Use checkpoints as lightweight save-points during long-running agent work.
- Use fuller session crystals before handoff, compaction, or session end.
- Use bounded local recall before resuming or acting on related work; inspect source artifacts before treating matches as truth.
- At session start or first use, run \`agent-crystallize doctor --updates\` when supported. If updates.shouldNotify is true, review install provenance and ask the user before upgrading. This optional npm check is cached; never block urgent capture on it.
- Prefer provenance pointers over copying large raw transcripts.
- Keep private/local artifacts out of public repos unless they are intentionally sanitized.
- Treat external memory systems as optional index/storage layers. The local artifact stays portable.

## Useful Commands

\`\`\`bash
agent-crystallize init
agent-crystallize checkpoint --body "Current state, decision, open loop, next action."
agent-crystallize now --from-checkpoints latest --body "Ready to hand off."
agent-crystallize recall "current task" --trace
agent-crystallize validate
agent-crystallize manifest --write
agent-crystallize doctor
agent-crystallize doctor --hooks
\`\`\`

If hooks are installed or continuity feels broken, verify the host harness
\`/hooks\` view. Codex may skip new or changed hooks until they are reviewed and
trusted.
`;
}

function renderHarnessPointer(harnessName: string) {
  return `Context persistence protocol:

- Follow \`~/.agents/context-persistence-protocol.md\` when available.
- Use \`agent-crystallize checkpoint\` after high-signal work, decisions, failed tests, reality checks, or before handoff/compaction.
- Use \`agent-crystallize now --from-checkpoints latest\` for fuller session crystals.
- Use bounded \`agent-crystallize recall "<current task>"\` when prior repo context may change the next action.
- Generated crystals are work context and evidence, not hidden chain-of-thought.
- Keep private/local artifacts out of public repos unless intentionally sanitized.
- If hooks are configured or continuity feels broken, run \`agent-crystallize doctor --hooks\` and verify the host \`/hooks\` view. Codex may skip new or changed hooks until trusted.

Harness: ${harnessName}.`;
}

function renderRepoPointer(project: string) {
  return `Context crystallization:

- This repo may keep local work-context artifacts under \`.agent-crystals/\`.
- Start with \`agent-crystallize doctor\` if continuity feels broken.
- If hooks are configured or continuity still feels broken, run \`agent-crystallize doctor --hooks\` and verify the host \`/hooks\` view.
- Use \`agent-crystallize checkpoint --project ${project} --body "<state, decision, open loop, next action>"\` during long work.
- Use \`agent-crystallize now --from-checkpoints latest --project ${project} --body "<handoff>"\` before handoff or compaction.
- Use \`agent-crystallize recall "<current task>"\` when resuming or when prior repo context may change the action.
- Treat generated crystals as local/private by default. Commit only sanitized examples or intentionally reviewed artifacts.`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validate(rest: string[]) {
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
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

function annotate(rest: string[], expected?: Map<string, string>) {
  const copy = [...rest];
  const repo = resolveRepoRoot(takeFlag(copy, "--repo") ?? process.cwd());
  return withLifecycleLock(repo, () => annotateLocked(rest, expected));
}

function annotateLocked(rest: string[], expected?: Map<string, string>) {
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
  const paths = takeRepeatedFlag(rest, "--artifact");
  const action = takeFlag(rest, "--action") as Action;
  const reason = takeFlag(rest, "--reason")?.trim();
  const source = takeFlag(rest, "--source-ref")?.trim();
  const target = takeFlag(rest, "--target");
  if (rest.length || !paths.length || !actions.includes(action) || !reason || !source) {
    throw new Error("annotate requires --artifact, --action, --reason and --source-ref; unknown arguments are rejected.");
  }
  const records = collectArtifactRecords(repo, ".agent-crystals");
  const lookup = (path: string) => records.find(record => record.path === relative(repo, resolve(repo, path)));
  const selected = paths.map(path => lookup(path));
  if (selected.some(record => !record || !isValidArtifact(record))) throw new Error("Every artifact must be an existing valid local crystal/checkpoint.");
  if ((action === "consolidated" || action === "superseded") && selected.some(record => !isValidActiveArtifact(record!))) {
    throw new Error("Sources changed lifecycle state; re-read before consolidation or supersession.");
  }
  if (expected && selected.some(record => expected.get(record!.path) !== fingerprint(repo, record!.path))) {
    throw new Error("Source content changed while synthesizing; review before consolidation.");
  }
  const destination = target ? lookup(target) : undefined;
  if (action !== "archive" && action !== "restore" && !destination) throw new Error("This relation requires --target.");
  if (destination && (!isValidActiveArtifact(destination) || selected.some(record => record!.path === destination.path))) {
    throw new Error("Target must be valid, active, and distinct from sources.");
  }
  if (target && !destination) throw new Error("Target was not found.");
  if (destination && selected.some(record => record!.project !== destination.project || record!.scope !== destination.scope)) {
    throw new Error("Annotation source and target must share project and scope.");
  }
  upsertLocalExclude(repo, resolveArtifactProfile(repo), false, false);
  const result = writeAnnotation(repo, [...new Set(selected.map(record => record!.path))], action, reason, source, destination?.path);
  return { ok: true, ...result, manifest: manifest(["--repo", repo, "--write"]) };
}

async function currentState(rest: string[]) {
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
  const paths = takeRepeatedFlag(rest, "--artifact");
  const topic = takeFlag(rest, "--topic")?.trim();
  const body = takeFlag(rest, "--body")?.trim();
  const reason = takeFlag(rest, "--reason")?.trim();
  const source = takeFlag(rest, "--source-ref")?.trim();
  if (rest.length || !paths.length || !topic || !body || !reason || !source) {
    throw new Error("current-state requires explicit --artifact sources, --topic, --body synthesis, --reason and --source-ref.");
  }
  const records = collectArtifactRecords(repo, ".agent-crystals");
  const selected = paths.map(path => records.find(record => record.path === relative(repo, resolve(repo, path))));
  if (selected.some(record => !record || !isValidActiveArtifact(record))) throw new Error("Rollup sources must be valid and active.");
  if (new Set(selected.map(record => `${record!.project}:${record!.scope}`)).size !== 1) throw new Error("Rollup sources must share project and scope.");
  const refs = [...new Set(selected.map(record => record!.path))];
  const expected = new Map(refs.map(path => [path, fingerprint(repo, path)]));
  const result = await crystallize([
    "--repo", repo, "--project", selected[0]!.project!, "--scope", selected[0]!.scope!,
    "--title", `Current state - ${topic}`, "--topic", topic, "--body", body,
    "--source-ref", source, "--finding", reason,
    ...refs.flatMap(path => ["--relation", `derived_from:${path}`]),
    "--open-loop", "Verify this synthesis against its sources and live state before consequential action.",
  ], "crystal") as { relativePath: string };
  try {
    const annotation = annotate(["--repo", repo, ...refs.flatMap(path => ["--artifact", path]),
      "--action", "consolidated", "--target", result.relativePath, "--reason", reason, "--source-ref", source], expected);
    return { ok: true, currentState: result, annotation };
  } catch (error) {
    throw new Error(`Current-state artifact retained at ${result.relativePath}; consolidation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function recall(rest: string[]) {
  const includeInactive = takeBooleanFlag(rest, "--include-inactive");
  const includeWeak = takeBooleanFlag(rest, "--include-weak");
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
  const crystalsDir = takeFlag(rest, "--crystals-dir") ?? ".agent-crystals";
  const explicitQuery = takeFlag(rest, "--query");
  const topics = takeRepeatedFlag(rest, "--topic").map((value) => value.toLowerCase());
  const files = takeRepeatedFlag(rest, "--file").map((value) => value.toLowerCase());
  const sessionId = takeFlag(rest, "--session-id")?.toLowerCase();
  const sinceValue = takeFlag(rest, "--since");
  const limit = Number(takeFlag(rest, "--limit") ?? 5);
  const includeInvalid = takeBooleanFlag(rest, "--include-invalid");
  const includeSuperseded = takeBooleanFlag(rest, "--include-superseded");
  const trace = takeBooleanFlag(rest, "--trace");
  const query = (explicitQuery ?? rest.filter((value) => !value.startsWith("--")).join(" ")).trim();
  for (let index = rest.length - 1; index >= 0; index -= 1) {
    if (!rest[index].startsWith("--")) rest.splice(index, 1);
  }
  if (rest.length > 0) throw new Error(`Unexpected recall arguments: ${rest.join(" ")}`);
  if (!query && topics.length === 0 && files.length === 0 && !sessionId && !sinceValue) {
    throw new Error("recall requires a query or at least one --topic, --file, --session-id, or --since filter.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("--limit must be an integer from 1 to 20.");
  const since = sinceValue ? Date.parse(sinceValue) : undefined;
  if (sinceValue && !Number.isFinite(since)) throw new Error(`Invalid --since value: ${sinceValue}`);

  const allRecords = collectArtifactRecords(repo, crystalsDir);
  const candidates = allRecords.filter((record) => {
    if (!includeInvalid && !isValidArtifact(record)) return false;
    if (!includeSuperseded && record.supersededBy.length > 0) return false;
    if (!includeInactive && (record.archived || record.consolidatedInto.length > 0)) return false;
    if (since !== undefined && Date.parse(record.observedAt ?? record.mtime) < since) return false;
    return true;
  });
  const queryTerms = tokenizeQuery(query);
  const documents = candidates.map(record => {
    const body = readFileSync(resolve(repo, record.path), "utf8").toLowerCase();
    return { record, body, tokens: new Set(tokenizeQuery(body)) };
  });
  const termWeights = new Map(queryTerms.map(term => {
    const count = documents.filter(doc => doc.tokens.has(term)).length;
    return [term, Math.log(1 + (documents.length + 1) / (count + 1))];
  }));
  const maxWeight = Math.max(0, ...termWeights.values());
  let weakCount = 0;
  const results: RecallResult[] = [];
  for (const { record, body: lowerMarkdown, tokens } of documents) {
    if (topics.length > 0 && !topics.every((topic) => record.topics.some((value) => value.toLowerCase().includes(topic)))) continue;
    if (files.length > 0 && !files.every((file) => lowerMarkdown.includes(file))) continue;
    if (sessionId && !lowerMarkdown.includes(sessionId)) continue;

    const matched: string[] = [];
    let score = 0;
    let matchedTerms = 0;
    let distinctiveMatch = false;
    const fields: Array<[string, string, number]> = [
      ["title", record.title.toLowerCase(), 6],
      ["topic", record.topics.join(" ").toLowerCase(), 5],
      ["focus", record.currentFocus.toLowerCase(), 4],
      ["path", record.path.toLowerCase(), 3],
      ["body", lowerMarkdown, 1],
    ];
    for (const term of queryTerms) {
      if (!tokens.has(term)) continue;
      matchedTerms++;
      const rarity = termWeights.get(term)!;
      if (rarity >= maxWeight * 0.65) distinctiveMatch = true;
      for (const [field, value, weight] of fields) {
        if (!tokenizeQuery(value).includes(term)) continue;
        score += weight * rarity;
        matched.push(`${field}:${term}`);
        break;
      }
    }
    if (query && lowerMarkdown.includes(query.toLowerCase())) {
      score += 8;
      matched.push("exact-phrase");
    }
    if (!query || score > 0) {
      const weak = queryTerms.length > 0 &&
        (!distinctiveMatch || matchedTerms < Math.ceil(queryTerms.length / 2));
      if (weak) {
        weakCount++;
        if (!includeWeak) continue;
      }
      if (queryTerms.length) score *= matchedTerms / queryTerms.length;
      score += topics.length * 5 + files.length * 3 + (sessionId ? 3 : 0);
      results.push({
        path: record.path,
        kind: record.kind,
        title: record.title,
        observedAt: record.observedAt,
        score,
        matched: [...new Set(matched)],
        snippet: excerpt(record.currentFocus, 240),
      });
    }
  }
  results.sort((a, b) => b.score - a.score || (b.observedAt ?? "").localeCompare(a.observedAt ?? "") || a.path.localeCompare(b.path));
  return {
    ok: true,
    repo,
    crystalsDir,
    query: query || undefined,
    filters: { topics, files, sessionId, since: sinceValue, includeInvalid, includeSuperseded, includeWeak, includeInactive },
    resultCount: Math.min(results.length, limit),
    results: results.slice(0, limit),
    trace: trace
      ? { artifactCount: allRecords.length, candidateCount: candidates.length, matchedCount: results.length, weakCount,
          termWeights: Object.fromEntries(termWeights), broadenHint: "Use --include-weak to inspect partial matches." }
      : undefined,
  };
}

function tokenizeQuery(query: string) {
  return [...new Set((query.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu) ?? []).map(term => term.replace(/[.]+$/, "")))].filter((term) => term.length >= 2);
}

function manifest(rest: string[]) {
  const repo = resolveRepoRoot(takeFlag(rest, "--repo") ?? process.cwd());
  const crystalsDir = takeFlag(rest, "--crystals-dir") ?? ".agent-crystals";
  const includeSuperseded = takeBooleanFlag(rest, "--include-superseded");
  const write = takeBooleanFlag(rest, "--write");
  if (rest.length > 0) {
    throw new Error(`Unexpected manifest arguments: ${rest.join(" ")}`);
  }
  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);

  const generatedAt = new Date().toISOString();
  const records = collectArtifactRecords(repo, crystalsDir);
  const validArtifacts = records.filter(isValidArtifact);
  const invalidArtifacts = records.filter((record) => !isValidArtifact(record));
  const activeArtifacts = records.filter(isValidActiveArtifact);
  const supersededArtifacts = records.filter((record) => record.supersededBy.length > 0);
  const output = {
    generatedAt,
    repo,
    crystalsDir,
    artifactCount: records.length,
    validCount: validArtifacts.length,
    invalidCount: invalidArtifacts.length,
    activeCount: activeArtifacts.length,
    supersededCount: supersededArtifacts.length,
    activeArtifacts,
    inactiveArtifacts: records.filter(record => record.archived || record.consolidatedInto.length > 0),
    lifecycleIssues: [...new Set(records.flatMap(record => record.lifecycleIssues))],
    invalidArtifacts,
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
  const basenameCounts = new Map<string, number>();
  for (const record of records) {
    const normalizedPath = record.path.replace(/\\/g, "/");
    pathAliases.set(normalizedPath, record.path);
    pathAliases.set(`./${normalizedPath}`, record.path);
    const name = basename(normalizedPath);
    basenameCounts.set(name, (basenameCounts.get(name) ?? 0) + 1);
  }
  for (const record of records) {
    const name = basename(record.path.replace(/\\/g, "/"));
    if (basenameCounts.get(name) === 1) pathAliases.set(name, record.path);
  }
  for (const record of records) {
    if (!isValidArtifact(record)) continue;
    for (const relation of record.relations) {
      if (relation.type !== "supersedes") continue;
      const normalizedTarget = relation.target.replace(/\\/g, "/");
      const target = pathAliases.get(normalizedTarget) ?? pathAliases.get(normalizedTarget.replace(/^\.\//, ""));
      if (!target) continue;
      const superseders = supersededBy.get(target) ?? [];
      superseders.push(record.path);
      supersededBy.set(target, superseders);
    }
  }
  for (const record of records) {
    record.supersededBy = supersededBy.get(record.path) ?? [];
  }
  const lifecycleIssues = applyAnnotations(repo, records);
  for (const record of records) record.lifecycleIssues = lifecycleIssues;
  return records.sort((a, b) => {
    const byObserved = (b.observedAt ?? b.mtime).localeCompare(a.observedAt ?? a.mtime);
    return byObserved || a.path.localeCompare(b.path);
  });
}

function isValidArtifact(record: ArtifactRecord) {
  return record.validation.errors.length === 0;
}

function isValidActiveArtifact(record: ArtifactRecord) {
  return isValidArtifact(record) && record.supersededBy.length === 0 && !record.archived && record.consolidatedInto.length === 0;
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
    archived: false,
    consolidatedInto: [],
    annotations: [],
    lifecycleIssues: [],
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
  const normalizedPath = path.replace(/\\/g, "/");
  const errors: string[] = [];
  const warnings: string[] = [];
  const title = extractTitle(markdown);

  if (!title) errors.push("missing top-level title");
  errors.push(...validateSectionStructure(markdown));

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
    kind: normalizedPath.includes("/checkpoints/")
      ? "checkpoint"
      : normalizedPath.includes("/sessions/")
        ? "session"
        : "unknown",
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

interface ContinuityTailEntry {
  role: string;
  content: string;
  timestamp?: string;
  id?: string;
  hash: string;
  source?: string;
  truncated?: boolean;
}

interface StructuredFields {
  topics: string[];
  relations: RelationHint[];
  provenance: ProvenanceFields;
  continuityTail: ContinuityTailEntry[];
  continuityTailMaxChars: number;
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
  const changedFiles = git(repo, ["diff", "--name-only", "HEAD"]) ?? mergeUniqueLines(
    git(repo, ["diff", "--name-only"]) ?? "",
    git(repo, ["diff", "--cached", "--name-only"]) ?? "",
  );
  return {
    root,
    commit: git(repo, ["rev-parse", "--short", "HEAD"]),
    branch: git(repo, ["branch", "--show-current"]),
    statusShort: boundLines(git(repo, ["status", "--short"]) ?? "", 200),
    diffStat: boundLines(git(repo, ["diff", "HEAD", "--stat"]) ?? "", 200),
    changedFiles: boundLines(changedFiles, 200),
  };
}

function mergeUniqueLines(...values: string[]) {
  return [...new Set(values.flatMap((value) => value.split(/\r?\n/)).map((line) => line.trim()).filter(Boolean))].join("\n");
}

function boundLines(value: string, maxLines: number) {
  const lines = value.split(/\r?\n/).filter(Boolean);
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `... [${lines.length - maxLines} more lines omitted]`].join("\n");
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

  return collectArtifactRecords(repo, checkpointDir === ".agent-crystals/checkpoints" ? ".agent-crystals" : checkpointDir)
    .filter((record) => record.kind === "checkpoint" && isValidActiveArtifact(record))
    .slice(0, 5)
    .map((record) => ({
      path: record.path,
      title: record.title,
      observedAt: record.observedAt,
      focus: record.currentFocus,
    }));
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

function validateSectionStructure(markdown: string) {
  const recognized = new Set(canonicalSections);
  const headings = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)]
    .map((match) => match[1].trim())
    .filter((heading) => recognized.has(heading));
  const errors: string[] = [];
  const seen = new Set<string>();
  let highestCanonicalIndex = -1;

  for (const heading of headings) {
    if (seen.has(heading)) {
      if (!errors.includes(`duplicate section: ${heading}`)) errors.push(`duplicate section: ${heading}`);
      continue;
    }
    seen.add(heading);
    const canonicalIndex = canonicalSections.indexOf(heading);
    if (canonicalIndex < highestCanonicalIndex) {
      errors.push(`section out of canonical order: ${heading}`);
    } else {
      highestCanonicalIndex = canonicalIndex;
    }
  }
  return errors;
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
  const currentFocus = escapeEmbeddedHeadings(
    input.body ||
    (input.checkpointTrail.length > 0
      ? "No explicit session body was supplied. Use the checkpoint trail below as provenance anchors; inspect source checkpoints for details before acting."
      : "No explicit current focus body was supplied. Treat this artifact as a structural checkpoint until a richer handoff is written."),
  );
  const noun = input.kind === "checkpoint" ? "checkpoint" : "crystal";
  const sourceWindow = input.kind === "checkpoint" ? "manual mini-crystallization checkpoint" : "manual CLI snapshot";
  return `# ${singleLine(input.title)}

## Header

- Scope: ${singleLine(input.scope)}
- Project: ${singleLine(input.project)}
- Source window: ${sourceWindow}
- Budget: ${singleLine(input.budget)}
- Surface: ${singleLine(input.surface)}
- Repo: ${singleLine(input.repo)}
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

${renderContinuityTail(input.structured.continuityTail, input.structured.continuityTailMaxChars)}

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
${input.git.diffStat || "(no tracked diff from HEAD or unavailable)"}
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

function renderContinuityTail(entries: ContinuityTailEntry[], maxChars: number) {
  if (entries.length === 0) return "";
  return `## Continuity Tail

Raw bounded conversational tail for recovering immediate flow after compaction or cross-harness handoff. This section is continuity evidence, not promoted durable knowledge unless distilled into Decisions, Findings, Memory Candidates, or another reviewed artifact.

- Restore precedence: latest user instruction > harness compaction summary > distilled checkpoint state > this tail for nuance/order recovery.
- Budget: max ${maxChars} chars before rendering overhead; entries may be redacted, excerpted, or represented by pointers.
- Dedupe key: each entry includes hash=sha256(normalized redacted content), shortened for display.

${entries.map(renderContinuityTailEntry).join("\n\n")}`;
}

function renderContinuityTailEntry(entry: ContinuityTailEntry) {
  const meta = [
    `role=${entry.role}`,
    entry.timestamp ? `time=${entry.timestamp}` : undefined,
    entry.id ? `id=${entry.id}` : undefined,
    entry.source ? `source=${entry.source}` : undefined,
    `hash=${entry.hash}`,
    entry.truncated ? "truncated=true" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return `- ${singleLine(meta)}

  ${indentContinuation(escapeEmbeddedHeadings(entry.content))}`;
}

async function readStdinBody() {
  let body = "";
  for await (const chunk of process.stdin) {
    body += String(chunk);
  }
  return body.trim();
}

function takeStructuredFields(values: string[], continuityTailSource: string): StructuredFields {
  return {
    topics: [...takeRepeatedFlag(values, "--topic"), ...takeRepeatedFlag(values, "--tag")],
    relations: parseRelationHints(takeRepeatedFlag(values, "--relation")),
    provenance: takeProvenanceFields(values),
    continuityTail: parseContinuityTailArgs(takeRepeatedFlag(values, "--continuity-tail"), continuityTailSource),
    continuityTailMaxChars: 12000,
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

function parseContinuityTailArgs(values: string[], source: string): ContinuityTailEntry[] {
  return values.map((value) => parseContinuityTailEntry(value, source));
}

function parseContinuityTailEntry(value: string, source: string): ContinuityTailEntry {
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/^\[([^\]]+)]\s*([a-zA-Z][\w-]{0,31})\s*:\s*([\s\S]+)$/);
  if (bracketMatch) {
    return makeContinuityTailEntry({
      timestamp: bracketMatch[1].trim(),
      role: bracketMatch[2].trim(),
      content: bracketMatch[3].trim(),
      source,
    });
  }
  const pipeMatch = trimmed.match(/^([^|]{1,80})\|([a-zA-Z][\w-]{0,31})\s*:\s*([\s\S]+)$/);
  if (pipeMatch) {
    return makeContinuityTailEntry({
      timestamp: pipeMatch[1].trim(),
      role: pipeMatch[2].trim(),
      content: pipeMatch[3].trim(),
      source,
    });
  }
  const roleMatch = trimmed.match(/^([a-zA-Z][\w-]{0,31})\s*:\s*([\s\S]+)$/);
  if (roleMatch) {
    return makeContinuityTailEntry({
      role: roleMatch[1].trim(),
      content: roleMatch[2].trim(),
      source,
    });
  }
  return makeContinuityTailEntry({ role: "note", content: trimmed, source });
}

function makeContinuityTailEntry(input: {
  role: string;
  content: string;
  timestamp?: string;
  id?: string;
  source?: string;
  truncated?: boolean;
}): ContinuityTailEntry {
  const content = redactSensitiveText(input.content);
  return {
    role: sanitizeRole(input.role),
    content,
    timestamp: input.timestamp,
    id: input.id,
    source: input.source,
    truncated: input.truncated,
    hash: stableKey(normalizeForHash(`${input.role}\n${content}`)),
  };
}

function boundContinuityTail(entries: ContinuityTailEntry[], maxChars: number): ContinuityTailEntry[] {
  if (entries.length === 0 || maxChars === 0) return [];
  const result: ContinuityTailEntry[] = [];
  let used = 0;
  for (const entry of [...entries].reverse()) {
    const fixedOverhead = 160 + entry.role.length + (entry.timestamp?.length ?? 0) + (entry.id?.length ?? 0);
    const remaining = maxChars - used - fixedOverhead;
    if (remaining <= 0) break;
    const content =
      entry.content.length > remaining
        ? `${entry.content.slice(0, Math.max(0, remaining - 20)).trimEnd()}... [truncated]`
        : entry.content;
    result.push({
      ...entry,
      content,
      truncated: entry.truncated || content !== entry.content,
      hash: stableKey(normalizeForHash(`${entry.role}\n${content}`)),
    });
    used += fixedOverhead + content.length;
  }
  return result.reverse();
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
  return items.map((item) => `- ${escapeEmbeddedHeadings(item)}`).join("\n");
}

function renderRelations(items: RelationHint[]) {
  if (items.length === 0) {
    return "- No explicit relation hints captured.";
  }
  return items
    .map((item) => `- ${escapeEmbeddedHeadings(item.type)}: ${escapeEmbeddedHeadings(item.target)}`)
    .join("\n");
}

function renderSessionProvenance(provenance: ProvenanceFields, surface: string) {
  const rows: string[] = [`- Surface: ${singleLine(surface)}`];
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
    if (value) rows.push(`- ${label}: ${singleLine(value)}`);
  }
  for (const sourceRef of provenance.sourceRefs) {
    rows.push(`- Source ref: ${singleLine(sourceRef)}`);
  }
  for (const pair of provenance.custom) {
    rows.push(`- ${singleLine(pair.key)}: ${singleLine(pair.value)}`);
  }
  if (rows.length === 1) {
    rows.push("- No explicit session provenance supplied. Add safe source/session pointers when available; never dump broad environment variables.");
  }
  return rows.join("\n");
}

function renderNumbered(items: string[], fallback: string[]) {
  const values = items.length > 0 ? items : fallback;
  return values.map((item, index) => `${index + 1}. ${escapeEmbeddedHeadings(item)}`).join("\n");
}

function singleLine(value: string) {
  return value.replace(/\s*\r?\n\s*/g, " ").trim();
}

function escapeEmbeddedHeadings(value: string) {
  return value.replace(/^( {0,3})(#{1,2})(?=\s)/gm, "$1\\$2");
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
  agent-crystallize setup [options]
  agent-crystallize init [options]
  agent-crystallize doctor [options]
  agent-crystallize now [options] [summary]
  agent-crystallize checkpoint [options] [summary]
  agent-crystallize validate [options]
  agent-crystallize manifest [options]
  agent-crystallize recall [options] <query>
  agent-crystallize annotate --artifact <path> --action <archive|restore|consolidated|superseded|corrects|follows-up|relates-to> --reason <text> --source-ref <ref> [--target <path>]
  agent-crystallize current-state --artifact <path> [--artifact <path>] --topic <topic> --body <synthesis> --reason <text> --source-ref <ref>
  agent-crystallize hook [options]

Setup options:
  --dry-run                 Show planned setup actions without writing
  --force                   Replace existing protocol file when it differs
  --upgrade                 Update generated protocol/skills and preserve timestamped backups
  --all                     Configure all supported global harness pointers
  --codex                   Add/update ~/.codex/AGENTS.md managed pointer
  --claude                  Add/update ~/.claude/CLAUDE.md managed pointer
  --skills                  Install public agent-context-crystallizer skill files for selected harnesses
  --hooks                   Report hook setup docs; v0 does not mutate hook config
  --protocol <path>         Protocol path; default ~/.agents/context-persistence-protocol.md

Init options:
  --repo <path>             Repo to activate; default cwd
  --project <slug>          Project/product slug; default saved repo project or repo basename
  --artifact-profile <name> local-private|reviewed-shared; default saved profile or local-private
  --dry-run                 Show planned init actions without writing
  --no-checkpoint           Do not create an activation checkpoint
  --no-agents-md            Do not create/update repo AGENTS.md pointer
  --migrate-excludes        Remove broad legacy managed excludes after explicit review
  --hooks                   Report hook setup docs; v0 does not mutate hook config
  --mind                    Mark intent to connect an external memory layer later

Doctor options:
  --updates                 Check npm latest (2s timeout, 24h cache); suggest, never install
  --repo <path>             Repo to inspect; default cwd
  --codex                   Check ~/.codex/AGENTS.md managed pointer
  --claude                  Check ~/.claude/CLAUDE.md managed pointer
  --hooks                   Check common hook config locations and print trust/verification reminders

Crystal/checkpoint options:
  --repo <path>              Repo to crystallize; default cwd
  --out-dir <path>           Output dir relative to repo; default .agent-crystals/sessions or .agent-crystals/checkpoints
  --title <title>            Crystal title
  --scope <scope>            repo|project|product|cross-project|user|system; default project
  --project <slug>           Project/product slug; default saved repo project or repo basename
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
  --continuity-tail <entry>  Add bounded raw continuity entry, e.g. "user: latest correction"; repeatable
  --continuity-tail-max-chars <n>  Max rendered continuity-tail content budget; default 12000
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

Recall options:
  --include-inactive        Include archived and consolidated sources for recovery
  --include-weak            Include partial matches excluded by coverage/rarity filtering
  --repo <path>              Repo to search; default cwd (resolved to Git root)
  --crystals-dir <path>      Crystals dir relative to repo; default .agent-crystals
  --query <text>             Query text; positional text is also accepted
  --topic <name>             Require a topic match; repeatable
  --file <path>              Require an artifact-body file/path match; repeatable
  --session-id <id>          Require a session provenance match
  --since <date>             Only artifacts observed at/after this date
  --limit <count>            Maximum results, 1-20; default 5
  --include-invalid          Include schema-invalid evidence; off by default
  --include-superseded       Include superseded artifacts; off by default
  --trace                    Show candidate and match counts

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
  --no-continuity-tail             Do not include hook-provided continuity_tail/messages arrays
  --continuity-tail-max-chars <n>  Max rendered continuity-tail content budget; default 12000
`);
}
