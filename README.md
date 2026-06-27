# agent-crystallize

Local-first checkpoints and crystals for long-running AI coding agent sessions.

```text
Compaction keeps the model running.
Crystallization keeps the work recoverable.
```

`agent-crystallize` writes durable Markdown artifacts that help future Codex,
Claude Code, Cursor, or other coding-agent sessions resume from the actual work
state: current focus, decisions, evidence, open loops, changed files, and next
actions.

## Why

Long-running coding-agent sessions now span hours, many files, multiple tools,
and multiple compactions. A compacted summary can keep a chat alive, but it often
loses the details that make engineering work safe to continue.

`agent-crystallize` gives you explicit save-points:

- `checkpoint`: quick mini-crystallization after decisions, bugs, test results,
  or implementation slices;
- `now`: fuller session crystal before handoff, compaction, or session end.

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

## Quick Start

Create a lightweight checkpoint in the current repo:

```bash
agent-crystallize checkpoint \
  --body "Finished auth refactor. Tests pass. Need review of OAuth edge cases."
```

Create a fuller session crystal:

```bash
agent-crystallize now \
  --project my-product \
  --budget standard \
  --body "Current focus, decisions, open loops, and next action."
```

Read body text from stdin:

```bash
cat handoff.md | agent-crystallize checkpoint --stdin
```

Default output:

```text
.agent-crystals/
  checkpoints/
  sessions/
```

## What It Captures

- current focus;
- decision and finding placeholders;
- git commit, branch, status, diff stat, and changed files;
- detected instruction files such as `AGENTS.md` and `CLAUDE.md`;
- open-loop and next-action sections;
- a resume prompt for the next agent/session.

## What It Does Not Capture

`agent-crystallize` does not preserve hidden chain-of-thought. It preserves
durable work context: evidence, decisions, findings, open loops, and resume
state.

It is not a hosted memory service, transcript database, or AI chat product. The
default CLI writes inspectable local files.

## Commands

```bash
agent-crystallize checkpoint [options] [summary]
agent-crystallize now [options] [summary]
```

Options:

```text
--repo <path>       Repo to crystallize; default cwd
--out-dir <path>    Output dir relative to repo
--title <title>     Artifact title
--scope <scope>     repo|project|product|cross-project|user|system
--project <slug>    Project/product slug; default repo basename
--budget <mode>     fast|standard|deep
--surface <name>    codex|claude-code|cursor|cli|hook
--body <text>       Current focus body
--stdin             Read body from stdin
```

## Relationship To Stewie

`agent-crystallize` is part of the Stewie open-core ecosystem.

- `agent-crystallize`: local-first checkpoints and crystals for agent work.
- PBC: open format for product behavior truth.
- Stewie Reflect: product-facing reflection and owner's-manual workflow.

Created and maintained by Vinh Nguyen / MrWarPro, founder of Stewie.
