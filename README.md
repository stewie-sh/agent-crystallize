# agent-crystallize

Local-first checkpoints and crystals for long-running AI coding agent sessions.

Status: public seed / first npm release.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

```text
Stop compacting. Start crystallizing.

Compaction keeps the model running.
Crystallization keeps the work recoverable.
```

`agent-crystallize` writes durable Markdown artifacts that help future Codex,
Claude Code, Cursor, or other coding-agent sessions resume from the actual work
state: current focus, decisions, evidence, open loops, changed files, and next
actions.

It is the first open-source slice of **Agent Context Crystallization**: the
practice of turning long-running agent work into durable, provenance-backed
checkpoints, evidence, open loops, and resume state.

## The Problem

Long-running coding-agent sessions now span hours, many files, multiple tools,
and multiple compactions.

Compaction is necessary, but it is lossy. It can keep the chat alive while
flattening the work:

- the next session remembers the gist but loses the why;
- decisions survive as vague summaries without evidence;
- failed paths and edge cases disappear;
- open loops turn into generic TODOs;
- each agent spends tokens reloading context that should have been saved.

```text
The model survives, but the work does not.
```

## The Workflow

Create frequent checkpoints while the work is active:

```bash
agent-crystallize checkpoint \
  --body "Finished auth refactor. Tests pass. Need OAuth replay check next."
```

Before compaction, handoff, or session end, create a fuller session crystal:

```bash
agent-crystallize now \
  --project my-product \
  --budget standard \
  --body "Ready to compact. Preserve latest state, open loops, and next action."
```

If you have been checkpointing throughout the task, roll those checkpoints into
the session crystal:

```bash
agent-crystallize now \
  --from-checkpoints latest \
  --body "What changed since the latest checkpoint, current open loops, and next action." \
  --agent-body codex \
  --harness codex-cli \
  --session-id "$CODEX_THREAD_ID" \
  --transcript-uri "$HOME/.codex/sessions/2026/06/28/rollout-example.jsonl" \
  --topic "parser" \
  --relation "depends_on:git commit abc123" \
  --decision "Keep the parser local-first for this release." \
  --finding "Replay tests are the highest-risk remaining check." \
  --open-loop "Run duplicate-row replay test before handoff." \
  --test "npm test passed." \
  --next-action "Run replay test and update this crystal." \
  --memory-candidate "Strict replay checks should be captured before handoff."
```

Validate local crystals before relying on them for handoff:

```bash
agent-crystallize validate
```

Default output:

```text
.agent-crystals/
  checkpoints/
  sessions/
```

## Five-Minute Useful Path

Install the package and create a first checkpoint:

```bash
npm install -g @stewie-sh/agent-crystallize

agent-crystallize checkpoint \
  --body "Finished the launch-readiness pass. Build passes. Need public scan next." \
  --topic "launch-readiness" \
  --decision "Keep generated dogfood artifacts local unless they are sanitized examples." \
  --test "npm run check passed." \
  --next-action "Run npm pack --dry-run and scan tracked files before release."
```

Before ending the session, roll the recent checkpoints into a session crystal:

```bash
agent-crystallize now \
  --from-checkpoints latest \
  --body "Ready to hand off. Preserve current focus, decisions, verification, open loops, and next action." \
  --topic "agent-context-crystallization"
```

Then validate what you plan to rely on:

```bash
agent-crystallize validate
```

Generated `.agent-crystals/` files are local work artifacts by default. This repo
keeps them ignored so private dogfood traces do not become public accidentally.
Public dogfood material should be represented as sanitized Markdown under
`examples/`.

## Why Local First

The first version is intentionally boring infrastructure:

- no account;
- no login;
- no network dependency;
- no hosted database;
- no server setup;
- inspectable Markdown files in your repo.

You can commit `.agent-crystals/`, ignore it, archive it, or import it into a
memory system later. The local artifact is the portable source of continuity.

## Install

Install globally with npm:

```bash
npm install -g @stewie-sh/agent-crystallize
agent-crystallize --help
```

For local development from a checkout:

```bash
npm install
npm run build
node dist/index.js --help
```

## What It Captures

- current focus;
- checkpoint trail for session crystals;
- topics and lightweight relation hints for later indexing;
- safe session provenance such as agent body, harness, session id, transcript
  pointer, and source references when supplied;
- git commit, branch, status, diff stat, and changed files;
- detected instruction files such as `AGENTS.md` and `CLAUDE.md`;
- decision, finding, open-loop, and next-action sections;
- a resume prompt for the next agent/session.

`agent-crystallize validate` checks generated artifacts for required sections,
missing header fields, TODO-only current focus, and TODO-heavy quality warnings.

Git is the provenance backbone. Crystals are the work-memory layer.

Git commits show what changed. Crystals preserve why it mattered, what remains
open, and how to resume.

## What It Does Not Capture

`agent-crystallize` does not preserve hidden chain-of-thought. It preserves
durable work context: evidence, decisions, findings, open loops, and resume
state.

It is not a hosted memory service, transcript database, or AI chat product. The
default CLI writes local files only.

## Commands

```bash
agent-crystallize checkpoint [options] [summary]
agent-crystallize now [options] [summary]
agent-crystallize validate [options]
agent-crystallize manifest [options]
agent-crystallize hook [options]
```

Options:

```text
--repo <path>              Repo to crystallize; default cwd
--out-dir <path>           Output dir relative to repo
--title <title>            Artifact title
--scope <scope>            repo|project|product|cross-project|user|system
--project <slug>           Project/product slug; default repo basename
--budget <mode>            fast|standard|deep
--surface <name>           codex|claude-code|cursor|cli|hook
--body <text>              Current focus body
--stdin                    Read body from stdin
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
```

Validate options:

```text
--repo <path>              Repo to validate; default cwd
--crystals-dir <path>      Crystals dir relative to repo; default .agent-crystals
--files <path>             Validate only this Markdown crystal; repeatable
--fail-on-warnings         Exit non-zero when warnings are present
```

Manifest options:

```text
--repo <path>              Repo to index; default cwd
--crystals-dir <path>      Crystals dir relative to repo; default .agent-crystals
--include-superseded       Include superseded artifacts in JSON output
--write                    Write .agent-crystals/manifest.json
```

Hook options:

```text
--repo <path>                    Repo for local hook artifacts; default cwd or hook stdin cwd
--harness <name>                 codex|claude-code|hook; default hook stdin harness or hook
--event <name>                   SessionStart|UserPromptSubmit|PostToolUse|PostToolBatch|PreCompact|PostCompact|Stop
--state-dir <path>               User-level hook state dir; default ~/.agent-crystallize/hooks
--stop-checkpoint-ms <ms>        Stop cadence threshold; default 1500000
--dedupe-window-ms <ms>          SessionStart/PostCompact dedupe window; default 600000
--max-pointers <count>           SessionStart local artifact pointers; default 3
--strict-precompact              Exit non-zero if PreCompact checkpoint fails
--include-transcript-uri         Include transcript_path from hook stdin when supplied
```

Read body text from stdin:

```bash
cat handoff.md | agent-crystallize checkpoint --stdin
```

## Examples

- [Basic checkpoint](examples/checkpoint.md)
- [Compaction recovery flow](examples/compaction-recovery.md)
- [Strict crystal example](examples/strict-crystal.md)
- [Sanitized session crystal fixture](examples/sanitized-session-crystal.md)
- [Agent Context Crystallization manifesto](docs/manifesto.md)
- [Hook automation guide](docs/hooks.md)

## Read In This Order

1. [STATUS.md](STATUS.md)
2. [docs/quickstart.md](docs/quickstart.md)
3. [docs/crystal-format.md](docs/crystal-format.md)
4. [docs/manifesto.md](docs/manifesto.md)
5. [docs/hooks.md](docs/hooks.md)
6. [ROADMAP.md](ROADMAP.md)
7. [examples/](examples/)
8. [CONTRIBUTING.md](CONTRIBUTING.md)
9. [SECURITY.md](SECURITY.md)
10. [LICENSING.md](LICENSING.md)

## Relationship To Stewie

`agent-crystallize` is part of the Stewie open-core ecosystem.

- `agent-crystallize`: local-first checkpoints and crystals for agent work.
- PBC: open format for product behavior truth.
- Other tools can import or build on local crystals when that is useful, but
  this package stays local-file-only by default.

Created and maintained by Vinh Nguyen / MrWarPro, founder of Stewie.

## License

Apache-2.0. See [LICENSING.md](LICENSING.md) for the repo license mapping.
