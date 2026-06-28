# Status

**Repo:** `agent-crystallize`  
**Package:** `@stewie-sh/agent-crystallize`  
**Phase:** private pre-public seed  
**Date:** June 2026

## Current State

This repo is the public home for the first local-first slice of Agent Context
Crystallization:

- a TypeScript CLI that writes checkpoint and session crystal Markdown files;
- a default `.agent-crystals/` artifact convention;
- structured sections for decisions, findings, open loops, evidence, and resume
  state;
- validation for generated artifacts;
- public examples and docs for coding-agent handoff and compaction recovery.

The package is not published to npm yet.

## What Is Stable Enough To Review

- The core problem framing: compaction keeps the model running, while
  crystallization keeps the work recoverable.
- The local-first model: no account, no network dependency, no telemetry, and
  no hosted database in the default CLI.
- The distinction between checkpoints and crystals:
  - checkpoint: lightweight save-point during active work;
  - crystal: fuller handoff artifact before compaction, session end, or handoff.
- The public vocabulary around durable work context, evidence, decisions, open
  loops, and resume state.
- The safety boundary: this tool does not preserve hidden chain-of-thought.

## What Is Still Draft

- The exact long-term artifact schema.
- The validation profile and strictness level for public examples.
- The best default cadence for checkpoints during long-running agent work.
- The relationship between local artifacts and optional future import/sync
  adapters.
- The first npm release version and release checklist.

## What Is Intentionally Missing Here

This repo intentionally does not contain:

- hosted memory service code;
- billing, accounts, auth, or sync infrastructure;
- private Stewie strategy or customer workflow;
- private transcripts or raw internal handoff material;
- product-specific operating-memory internals.

Those belong outside this public local-first CLI repo.
