# Status

**Repo:** `agent-crystallize`  
**Package:** `@stewie-sh/agent-crystallize`  
**Phase:** public seed / first npm release  
**Date:** July 2026

## Current State

This repo is the public home for the first local-first slice of Agent Context
Crystallization:

- a TypeScript CLI that writes checkpoint and session crystal Markdown files;
- a default `.agent-crystals/` artifact convention;
- structured sections for decisions, findings, open loops, evidence, and resume
  state;
- validation for generated artifacts;
- public examples and docs for coding-agent handoff, compaction recovery, and
  the Agent Context Crystallization category.
- an experimental local-first hook runner for Codex and Claude Code lifecycle
  events, including compact-resume bootstrap output.
- optional bounded Continuity Tail sections for preserving recent turn order and
  nuance without treating raw messages as durable truth.
- a public `agent-context-crystallizer` skill wrapper for skill-capable agent
  harnesses, with first-class setup smoke-tested install paths for Codex and
  Claude Code and manual portability for other Agent Skills-compatible
  harnesses.

The current npm release is published as `@stewie-sh/agent-crystallize@0.1.11`.

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
- The public artifact strategy: generated `.agent-crystals/` files are local
  by default; sanitized fixtures belong under `examples/`.
- The hook boundary: hooks reduce manual checkpointing burden, but generated
  artifacts remain local/private-by-default.
- The skill boundary: shipped skills are thin wrappers around the CLI, not a
  second source of artifact-format truth.
- The skill support boundary: Codex and Claude Code are first-class setup
  smoke-tested targets; other Agent Skills-compatible harnesses should use
  manual install until their discovery and trust flows are tested.

## What Is Still Draft

- The exact long-term artifact schema.
- The validation profile and strictness level for generated artifacts.
- The best default cadence for checkpoints during long-running agent work.
- The relationship between local artifacts and optional future import/sync
  adapters.
- The hook installer/plugin story for Codex and Claude Code.
- The best long-term installation/update flow for skills across harnesses.
- Post-release feedback from real Codex and Claude Code hook usage.
- GitHub Actions release publishing is configured for version tags and verified
  with npm Trusted Publishing as of `v0.1.4`; no npm token is committed here.

## What Is Intentionally Missing Here

This repo intentionally does not contain:

- hosted service, sync, billing, or account code;
- private planning notes, internal strategy, or customer workflow;
- private transcripts or raw internal handoff material.

Those belong outside this public local-first CLI repo.
