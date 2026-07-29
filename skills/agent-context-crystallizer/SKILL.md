---
name: agent-context-crystallizer
description: Preserve high-signal work context with local checkpoints and session crystals using the agent-crystallize CLI. Use before compaction, handoff, session end, cross-agent transfer, after major decisions/findings/failures, or when the user asks to checkpoint, crystallize, preserve context, save open loops, or create a resume handoff.
---

# Agent Context Crystallizer

Use the `agent-crystallize` CLI as the source of truth. This skill is a thin
workflow wrapper; do not reimplement the artifact format by hand unless the CLI
is unavailable.

## Resolve The CLI Before Writing

Do not assume the agent harness inherited the user's interactive-shell `PATH`.
Resolve one working invocation in this order:

1. Use a repo-provided `agent-crystallize` package script when present.
2. Use `agent-crystallize` when `command -v agent-crystallize` succeeds.
3. If `AGENT_CRYSTALLIZE_CLI` names a readable JavaScript entry point, invoke it
   with the current Node runtime: `node "$AGENT_CRYSTALLIZE_CLI" ...`.
4. Use a verified package-manager or harness-provided bundled runtime path.
   Never guess a machine-specific path or copy one from another user.
5. Only when no CLI is available, write a plainly labelled **non-validated
   emergency handoff** outside the canonical `.agent-crystals/checkpoints/` and
   `.agent-crystals/sessions/` directories. Replace it with a CLI-generated,
   validated artifact when the runtime is restored.

The emergency handoff preserves continuity; it is not a valid crystal and must
not silently enter the manifest or normal validation set.

## Workflow

1. Inspect the local state that matters: `AGENTS.md`/`CLAUDE.md` if present,
   `git status --short`, relevant changed files, recent test/build/deploy
   results, and existing `.agent-crystals/manifest.json` when present.
2. Choose the lightest useful artifact:
   - checkpoint: during active work, before risky edits, before compaction, or
     after a high-signal decision/finding/failure;
   - session crystal: before handoff/session end, or to roll up recent
     checkpoints.
3. Prefer structured flags over vague prose: `--decision`, `--finding`,
   `--open-loop`, `--test`, `--next-action`, `--evidence`,
   `--memory-candidate`, `--topic`, and `--relation type:target`.
4. Add safe provenance when available: `--agent-body`, `--harness`,
   `--session-id`, `--transcript-uri`, and `--source-ref`. Never dump broad
   environment variables or secrets.
5. Use `--continuity-tail` only for short recent turns where order/nuance
   matters after compaction. It is raw continuity evidence, not durable truth.
6. Validate important artifacts before relying on them.

## Commands

Fast checkpoint:

```bash
agent-crystallize checkpoint \
  --body "<current state, decision, open loop, next action>" \
  --decision "<decision and authority>" \
  --finding "<runtime finding>" \
  --open-loop "<unfinished item>" \
  --next-action "<next concrete action>"
```

Session crystal from recent checkpoints:

```bash
agent-crystallize now \
  --from-checkpoints latest \
  --body "<synthesis since the latest checkpoint and handoff state>"
```

Validate:

```bash
agent-crystallize validate --fail-on-warnings
```

Hook/continuity check:

```bash
agent-crystallize doctor --codex --claude --hooks
```

## Guardrails

- Preserve work context, not hidden chain-of-thought.
- Raw evidence is not truth; decisions/findings should keep provenance.
- Keep generated `.agent-crystals/` local/private unless intentionally
  reviewed and sanitized.
- Prefer paths, ids, commits, and source refs over copying large logs or
  transcripts.
- If hooks are configured but continuity feels broken, ask the user to verify
  the host `/hooks` view. Codex may skip new or changed hooks until trusted.
- Never treat a hand-written emergency handoff as schema-valid merely because
  it is readable Markdown.
