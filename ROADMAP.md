# Roadmap

## Near-Term

1. Keep the public surface small, local-first, and safe to inspect.
2. Tighten the generated artifact format so fresh checkpoints are useful without
   manual cleanup.
3. Add a manifest/index command for `.agent-crystals/` so agents can route by
   clean/latest/relevant artifacts instead of loading every Markdown file.
4. Improve examples so they demonstrate real compaction recovery and
   cross-agent handoff, not only syntax.
5. Prepare the first npm release of `@stewie-sh/agent-crystallize`.

## V0 Product Principle

The first public version should be useful immediately during real agent work.
The sharpest entry point is the pre-compaction moment: capture the high-signal
work context before the harness compresses it.

V0 should complement popular coding-agent harnesses rather than replace their
own compaction or memory behavior:

- preserve raw or lightly structured work memory that would otherwise be lost;
- capture provenance such as session ids, transcript pointers, commits, and
  source refs when safe and available;
- keep decisions, findings, open loops, and resume state inspectable in local
  Markdown;
- make post-compaction continuation cheaper by giving the next agent a concrete
  artifact to read;
- leave room for richer memory systems to later import crystals and derive
  higher-level patterns, heuristics, and reusable knowledge.

The goal is practical recovery first, deeper memory synthesis later.

## Likely Next CLI Work

- `manifest`: index checkpoints/crystals with validation status, scope, project,
  topics, source refs, and short current-focus excerpts.
- Better validation output for public examples and CI.
- Safer default templates for `checkpoint` and `now`.
- A public `AGENTS.md` example that shows how an agent should checkpoint without
  bloating startup context.
- More examples for Codex CLI, Claude Code hooks, and generic skill-capable
  agent harnesses.

## Public Launch Readiness

Before making the repo public or announcing it:

- run `npm run check`;
- run `npm pack --dry-run`;
- validate all committed examples with warnings treated as failures;
- scan tracked files for private names, transcripts, machine paths, credentials,
  and internal strategy;
- ensure README, quickstart, crystal format, status, roadmap, contributing, and
  security docs agree on scope;
- verify package metadata, license, keywords, and install instructions.

## Not The Goal Of This Repo

This roadmap does not include:

- hosted workflow/runtime features;
- a cloud memory database;
- billing or account management;
- transcript ingestion at scale;
- project-management dashboards;
- private operating-memory orchestration.

Those can integrate with local crystals later, but the default OSS package
should remain useful without them.
