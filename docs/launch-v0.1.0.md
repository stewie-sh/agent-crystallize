# Launch Kit: agent-crystallize v0.1.0

This document is public launch copy for `agent-crystallize` v0.1.0 and the
Agent Context Crystallization category. It is intentionally product-facing, not
an internal planning note.

## One-Line Description

`agent-crystallize` is a local-first CLI for saving checkpoints and crystals
from long-running AI coding agent sessions.

## Short Announcement

Today we are publishing `agent-crystallize` v0.1.0, the first open-source slice
of Agent Context Crystallization.

Long-running coding-agent sessions now span hours, many files, many tools, and
multiple compactions. Compaction keeps the model running, but it can flatten the
work: decisions lose evidence, failed paths disappear, and open loops become
generic TODOs.

`agent-crystallize` writes local Markdown artifacts that preserve durable work
context: current focus, decisions, evidence, open loops, changed files, test
state, and a resume prompt for the next agent session.

Install:

```bash
npm install -g @stewie-sh/agent-crystallize
agent-crystallize checkpoint --body "Finished parser refactor. Tests pass. Need replay check next."
```

Repo: https://github.com/stewie-sh/agent-crystallize

## Blog Spine

### Title

Stop Compacting. Start Crystallizing.

### Thesis

Compaction keeps the model running. Crystallization keeps the work recoverable.

### Problem

AI coding agents are no longer single-prompt tools. They work across long
sessions, tool calls, diffs, tests, reviews, handoffs, and multiple context
boundaries. The chat may survive, but the useful work context often degrades.

The failure mode is subtle: the next agent gets a plausible summary, but not
enough evidence to safely continue. It may remember that something was decided
without knowing why, which files changed, which checks passed, what failed, or
what still needs attention.

### Category

Agent Context Crystallization is the practice of turning active agent work into
durable, provenance-backed artifacts:

- checkpoints during the work;
- fuller crystals before compaction, handoff, or session end;
- evidence pointers rather than raw transcript dumps;
- decisions with enough authority to act on;
- open loops and concrete next actions.

The goal is not to preserve every token. The goal is to preserve enough work
context for a future agent to continue safely.

### Product

`agent-crystallize` is the local-first CLI implementation of this practice. It
writes inspectable Markdown under `.agent-crystals/`, captures safe git and
session provenance, supports structured decisions/findings/open loops, and
validates artifacts before they become handoff material.

It has no account, no telemetry, no hosted database, and no runtime network
dependency in the default path.

### Why Local First

The artifact should be useful even if no memory service, sync layer, or hosted
runtime exists. A local Markdown checkpoint can be reviewed, ignored, committed,
archived, sanitized into an example, or imported into a richer memory system
later.

### Safety Boundary

`agent-crystallize` does not preserve hidden chain-of-thought. It preserves work
context: evidence, decisions, findings, open loops, and resume state.

Generated `.agent-crystals/` files are local/private by default because real
dogfood artifacts often include raw work context. Public examples should be
sanitized and stored under `examples/`.

### Call To Action

Try it before the next compaction:

```bash
npm install -g @stewie-sh/agent-crystallize
agent-crystallize checkpoint --body "Current focus, latest decision, verification, and next action."
agent-crystallize now --from-checkpoints latest --body "Ready to hand off."
agent-crystallize validate
```

## Social Drafts

### Short

Published `agent-crystallize` v0.1.0.

Compaction keeps the model running. Crystallization keeps the work recoverable.

Local-first checkpoints and crystals for long-running AI coding agent sessions:
https://github.com/stewie-sh/agent-crystallize

### Thread Starter

AI coding agents now work across hours of edits, tests, tool calls, and
compactions.

The chat may survive, but the work context often gets flattened.

We are calling the missing practice Agent Context Crystallization: durable,
provenance-backed checkpoints and crystals that let future agents resume from
real work state.

`agent-crystallize` v0.1.0 is the first local-first CLI slice:
https://github.com/stewie-sh/agent-crystallize

### Developer-Focused

Before your next long Codex or Claude Code session compacts, save the work
state:

```bash
npm install -g @stewie-sh/agent-crystallize
agent-crystallize checkpoint --body "What changed, what was decided, what passed, what comes next."
agent-crystallize now --from-checkpoints latest --body "Ready to hand off."
```

No account, no telemetry, local Markdown only.

## Links

- Repository: https://github.com/stewie-sh/agent-crystallize
- npm: https://www.npmjs.com/package/@stewie-sh/agent-crystallize
- Release: https://github.com/stewie-sh/agent-crystallize/releases/tag/v0.1.0
- Manifesto: https://github.com/stewie-sh/agent-crystallize/blob/main/docs/manifesto.md
