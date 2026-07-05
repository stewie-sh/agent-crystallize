# Agent Context Crystallization

Coding agents now work across long sessions, tool calls, file edits, tests,
handoffs, and compactions. The chat can continue while the work context becomes
thin, stale, or too vague to trust.

Agent Context Crystallization is the practice of turning active agent work into
durable, provenance-backed artifacts: checkpoints, evidence, decisions, open
loops, and resume state.

## Core Claim

Compaction keeps the model running. Crystallization keeps the work recoverable.

The useful unit is not every token from a session. The useful unit is enough
work context for a future agent to continue safely:

- current focus;
- decisions and their authority;
- findings and evidence pointers;
- reality checks from commands, tests, diffs, and commits;
- open loops and next actions;
- resume prompts that say where to restart.

## Principles

1. Preserve work context, not hidden chain-of-thought.
2. Treat raw transcripts, diffs, logs, and command output as evidence, not truth.
3. Prefer local, inspectable Markdown before richer storage or indexing.
4. Record enough provenance for a future reader to recover why a claim exists.
5. Checkpoint during the work, not only when the context window is already at
   risk.
6. Keep public examples sanitized and private dogfood traces local.

## Checkpoints And Crystals

A checkpoint is a lightweight save-point during active work. It should capture
the latest meaningful state: what changed, what was decided, what was verified,
and what comes next.

A crystal is a fuller handoff artifact before compaction, session end, or
cross-agent transfer. It should synthesize recent checkpoints, deduplicate
repeated details, and make the next action clear.

## What This CLI Does

`agent-crystallize` is the local-first CLI slice of this practice. It writes
Markdown artifacts under `.agent-crystals/`, captures safe git and session
provenance, supports structured decision/finding/open-loop fields, and validates
that generated artifacts are useful enough to resume from.

The default CLI has no account, no runtime network dependency, no telemetry, and
no hosted database. Storage adapters or richer memory systems can import these
local artifacts later, but the artifact itself remains the portable source of
continuity.
