#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const command = args.shift();

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
  const outDir = resolve(repo, takeFlag(rest, "--out-dir") ?? (kind === "checkpoint" ? ".agent-crystals/checkpoints" : ".agent-crystals/sessions"));
  const body = bodyFlag ?? (readStdin ? await readStdinBody() : rest.join(" ").trim());

  if (!existsSync(repo)) throw new Error(`Repo path does not exist: ${repo}`);
  if (!["fast", "standard", "deep"].includes(budget)) {
    throw new Error(`Invalid --budget ${budget}; expected fast, standard, or deep.`);
  }

  const observedAt = new Date();
  const git = collectGitContext(repo);
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
    git,
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
    note: "Local artifact written. Sync/storage adapters can import this artifact later.",
  };

  return result;
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
  git: GitContext;
  instructionFiles: string[];
  outputRelativePath: string;
}) {
  const currentFocus = input.body || "TODO: Fill in current focus, decisions, open loops, and next action.";
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

## Decisions

- TODO: Record decisions with authority and evidence.

## Findings

- TODO: Record findings observed from docs, code, runtime, or discussion.

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

## Tests And Verification

- TODO: Record commands run and results.

## Open Loops

- TODO: Record blockers, questions, and next verification steps.

## Memory Candidates

- TODO: Record candidate preferences, principles, workflows, findings, or project facts. Do not treat candidates as approved truth.

## Next Actions

1. Review and complete TODO sections while session context is still fresh.
2. Import or link this ${noun} from any memory system you trust.
3. Use this ${noun} as a resume source after compaction or handoff.

## Resume Prompt

\`\`\`text
Read ${input.repo}/AGENTS.md if present, then read this ${noun}:
${input.repo}/${input.outputRelativePath}

Resume from Current Focus, Decisions, Open Loops, and Next Actions.
\`\`\`
`;
}

async function readStdinBody() {
  let body = "";
  for await (const chunk of process.stdin) {
    body += String(chunk);
  }
  return body.trim();
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
`);
}
