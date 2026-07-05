# Hook Automation

`agent-crystallize hook` is the local-first automation layer for reducing manual
checkpointing burden during long-running agent sessions.

Hooks are optional. The CLI works without them, and manual `checkpoint` / `now`
commands remain the safest starting point.

## Ownership Model

- `agent-crystallize` owns local artifact writing under `.agent-crystals/`.
- Hook state lives outside the repo by default at `~/.agent-crystallize/hooks`.
- mind-core, if present in your environment, is an optional pointer/index layer.
  It should not also write duplicate local Markdown artifacts for the same hook
  event.
- Public hooks do not require mind-core, accounts, telemetry, sync, or a hosted
  service.

## Supported Events

### SessionStart

Print a short bootstrap with latest local session crystals and checkpoints.
This helps fresh, resumed, and compacted sessions notice local context before
acting.

### PostToolUse / PostToolBatch

Mark activity in hook state. These events do not write artifacts.

### PreCompact

Write a local checkpoint before lossy compaction. By default this is
best-effort. Add `--strict-precompact` if the harness should fail the hook when
checkpoint creation fails.

### PostCompact

Write a compact-summary checkpoint only when a recent `PreCompact` checkpoint
was not already recorded.

### Stop

Cadence fallback only. It writes a checkpoint only when there was activity after
the last checkpoint and the stop threshold elapsed.

## Codex Example

See [examples/hooks/codex-hooks.json](../examples/hooks/codex-hooks.json).

Codex loads hooks from user or project config layers such as
`~/.codex/hooks.json` or `<repo>/.codex/hooks.json`. Review and trust hook
commands in Codex before relying on them.

## Claude Code Example

See
[examples/hooks/claude-settings.fragment.json](../examples/hooks/claude-settings.fragment.json).

Claude Code command hooks receive event JSON on stdin. `SessionStart` uses
Claude's `hookSpecificOutput.additionalContext` shape so the bootstrap is
available to the agent without printing noisy terminal output.

## Privacy

Automated hooks may capture local repo paths, git state, session ids, compact
summaries, and work context you put into the session. Keep generated
`.agent-crystals/` ignored unless you intentionally review and sanitize them.

Use `--include-transcript-uri` only when transcript paths are safe to preserve.
By default, the public hook runner does not include transcript paths from hook
stdin.

## Deduplication

The hook runner keeps a small state file to avoid obvious duplication:

- `SessionStart` shortens repeated bootstrap output when local pointers are
  unchanged inside the dedupe window.
- `SessionStart` routes through the local manifest logic, so artifacts marked
  as superseded by newer crystals are not shown as primary resume pointers.
- `PostCompact` skips writing a duplicate checkpoint when `PreCompact` already
  wrote one recently.
- `Stop` writes only when there is uncheckpointed activity and the cadence
  threshold elapsed.

Override the defaults with:

```bash
agent-crystallize hook \
  --event Stop \
  --stop-checkpoint-ms 1500000 \
  --dedupe-window-ms 600000
```

## Extension Points

Keep richer memory systems outside the local writer path. A future adapter can
watch generated artifact paths or wrap the hook command, then attach pointers to
mind-core or another memory system without changing the local artifact contract.
