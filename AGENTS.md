# Project Instructions

## Scope

This repo is the public home for `agent-crystallize`, a local-first CLI for
creating durable checkpoints and crystals from long-running AI coding agent
sessions.

It exists to publish:

- the CLI;
- the `.agent-crystals/` local artifact convention;
- public usage docs and examples;
- adapter-neutral context crystallization concepts.

## Boundaries

- Keep this repo self-contained and public-facing.
- Do not import private planning notes, handoff docs, scratchpads, customer data,
  private transcripts, or internal strategy docs.
- Do not make hosted-memory, sync, billing, or product-roadmap claims in this
  repo.
- Do not claim to preserve hidden chain-of-thought. Say "work context",
  "evidence", "decisions", "open loops", and "resume state".
- Keep storage adapters optional. The default CLI writes local files only.

## Public Surface Guardrails

Before public push, scan tracked files for accidental private material and local
artifacts. This repo should not include:

- generated `.agent-crystals/` from private work;
- local databases or event logs;
- product strategy drafts;
- sensitive user, company, or prospect names;
- private chat transcripts;
- machine-specific credentials or config.

## Vocabulary

- **Checkpoint**: a lightweight save-point; a mini-crystallization.
- **Crystal**: a fuller session/work artifact.
- **Raw evidence**: transcript pointers, diffs, tool output, logs, or user
  instructions.
- **Resume state**: enough context for a future agent to continue safely.

## Read First

1. `README.md`
2. `docs/quickstart.md`
3. `docs/crystal-format.md`
4. `examples/`
