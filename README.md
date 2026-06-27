# agent-crystallize

Local-first checkpoints and crystals for long-running AI coding agent sessions.

Status: private pre-public seed. The npm package is not published yet.

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

This package is not published yet. For local development:

```bash
npm install
npm run build
node dist/index.js --help
```

When published:

```bash
npm install -g @stewie-sh/agent-crystallize
agent-crystallize --help
```

## What It Captures

- current focus;
- checkpoint trail for session crystals;
- topics and lightweight relation hints for later indexing;
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
--fail-on-warnings         Exit non-zero when warnings are present
```

Read body text from stdin:

```bash
cat handoff.md | agent-crystallize checkpoint --stdin
```

## Examples

- [Basic checkpoint](examples/checkpoint.md)
- [Compaction recovery flow](examples/compaction-recovery.md)
- [Strict crystal example](examples/strict-crystal.md)

## Relationship To Stewie

`agent-crystallize` is part of the Stewie open-core ecosystem.

- `agent-crystallize`: local-first checkpoints and crystals for agent work.
- PBC: open format for product behavior truth.
- Stewie Reflect: product-facing reflection and owner's-manual workflow.

Created and maintained by Vinh Nguyen / MrWarPro, founder of Stewie.
