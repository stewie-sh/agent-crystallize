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
