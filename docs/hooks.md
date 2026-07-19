# Hook Automation

`agent-crystallize hook` is the local-first automation layer for reducing manual
checkpointing burden during long-running agent sessions.

Hooks are optional. The CLI works without them, and manual `checkpoint` / `now`
commands remain the safest starting point.

Hooks are also harness-controlled. Installing or editing hook config is not the
same thing as proving the hook is active. Always verify the host harness after
changing hook files.

## Ownership Model

- `agent-crystallize` owns local artifact writing under `.agent-crystals/`.
- Hook state lives outside the repo by default at `~/.agent-crystallize/hooks`.
- An external memory system, if present in your environment, is an optional
  pointer/index layer. It should not also write duplicate local Markdown
  artifacts for the same hook event.
- Public hooks do not require any external memory service, accounts, telemetry,
  sync, or a hosted service.

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
was not already recorded. Codex receives a compact-resume bootstrap directly.
Claude Code treats `PostCompact` as a side-effect-only event: its documented
`hookSpecificOutput` schema has no `PostCompact` `additionalContext` branch, so
the command exits cleanly without emitting unsupported structured output.
Claude receives the bootstrap from the following
`SessionStart(source="compact")`, with `UserPromptSubmit` as a one-time fallback
if that lifecycle injection is delayed or absent.

### UserPromptSubmit

Mark activity in hook state. If a `PostCompact` hook ran since the last
prompt-level compact bootstrap, print one idempotent compact-resume fallback.
This reduces the blind window where a resumed session may answer from lossy
compacted context before noticing the latest checkpoint pointers.

### Stop

Cadence fallback only. It writes a checkpoint only when there was activity after
the last checkpoint and the stop threshold elapsed.

## Codex Example

See [examples/hooks/codex-hooks.json](../examples/hooks/codex-hooks.json).

Codex loads hooks from user or project config layers such as
`~/.codex/hooks.json` or `<repo>/.codex/hooks.json`. Review and trust hook
commands in Codex before relying on them.

Important Codex behavior:

- Open `/hooks` after first install and after every hook command/config change.
  Review the hook and press `t` to trust it.
- Codex records trust against the current hook definition. New or changed hooks
  are skipped until trusted again.
- Continuing without review means the hook may be present in config but will not
  run.
- Project-local hooks also depend on the project config layer being trusted.
- Do not use `--dangerously-bypass-hook-trust` for normal interactive work; it
  is only for automation that already vets hook sources out-of-band.

After the trust gate, command resolution is a separate failure mode. Hook
processes may not inherit your interactive shell or NVM-managed `PATH`. If
`agent-crystallize` or `node` is installed through a shell manager, prefer an
absolute command path or a small wrapper script that sets a known `PATH`, then
point Codex at the wrapper. Re-run `/hooks` after changing that wrapper command.

## Claude Code Example

See
[examples/hooks/claude-settings.fragment.json](../examples/hooks/claude-settings.fragment.json).

Claude Code command hooks receive event JSON on stdin. `SessionStart` uses
Claude's `hookSpecificOutput.additionalContext` shape so the bootstrap is
available to the agent without printing noisy terminal output.

Do not return `hookSpecificOutput.additionalContext` with
`hookEventName: "PostCompact"`. Claude Code rejects that shape. Keep
`PostCompact` for checkpoint/state side effects and rely on
`SessionStart(source="compact")` or the first `UserPromptSubmit` fallback for
model-visible continuity context. See the current
[Claude Code hooks reference](https://code.claude.com/docs/en/hooks).

Use `/hooks` in Claude Code to confirm the hooks are visible under the expected
events. For failures, check the transcript hook summaries and enable a debug log
with Claude Code's debug controls. As with Codex, avoid assuming your
interactive shell startup files or NVM `PATH` are available inside hook
commands.

## Privacy

Automated hooks may capture local repo paths, git state, session ids, compact
summaries, and work context you put into the session. Keep generated
`.agent-crystals/` ignored unless you intentionally review and sanitize them.

Use `--include-transcript-uri` only when transcript paths are safe to preserve.
By default, the public hook runner does not include transcript paths from hook
stdin.

If a harness supplies a `continuity_tail`, `continuityTail`, `messages`, or
`conversation` array in hook stdin, `PreCompact`, `PostCompact`, and `Stop`
checkpoints include a bounded Continuity Tail section. The tail is redacted,
size-limited, hash-labeled, and marked as raw continuity evidence rather than
durable truth. Disable it with `--no-continuity-tail` or adjust the budget with
`--continuity-tail-max-chars`.

## Deduplication

The hook runner keeps a small state file to avoid obvious duplication:

- `SessionStart` shortens repeated bootstrap output when local pointers are
  unchanged inside the dedupe window.
- `SessionStart` routes through the local manifest logic, so artifacts marked
  as superseded by newer crystals are not shown as primary resume pointers.
- `PostCompact` skips writing a duplicate checkpoint when `PreCompact` already
  wrote one recently. Codex can receive its bootstrap directly; Claude Code
  receives it through the supported compact `SessionStart` path.
- A successful compact `SessionStart` marks the bootstrap delivered, preventing
  a duplicate prompt-level fallback.
- `UserPromptSubmit` prints the post-compact fallback at most once per
  `PostCompact`.
- `Stop` writes only when there is uncheckpointed activity and the cadence
  threshold elapsed.

## Harness Caveat

Hook output injection is host-specific. `agent-crystallize hook` emits bootstrap
context only through event/output shapes supported by the active harness. For
Claude Code, `PostCompact` performs side effects but does not inject context;
`SessionStart(source="compact")` and the first `UserPromptSubmit` fallback are
the model-visible paths. Verify the lifecycle in your harness before relying on
hooks as the only compaction safety net.

Troubleshoot in this order:

1. Confirm the hook is trusted/enabled in the harness UI (`/hooks` where
   available).
2. Confirm the event and matcher actually fire for the action you are testing.
3. Confirm the command can run in a minimal non-interactive environment.
4. Confirm generated artifacts or hook state changed under `.agent-crystals/`
   or `~/.agent-crystallize/hooks`.

Use `doctor --hooks` as a local reminder and config audit:

```bash
agent-crystallize doctor --codex --claude --hooks
```

The doctor can report common hook config files and remind you to verify/trust
them. It cannot prove Codex trust state, because an untrusted Codex hook is
skipped before the hook command is invoked.

For a minimal command-resolution smoke test, pipe sample hook JSON into the
same command or wrapper used by the harness:

```bash
printf '{"cwd":"%s","hook_event_name":"PostToolUse","tool_name":"Bash"}\n' "$PWD" \
  | agent-crystallize hook --harness codex --event PostToolUse
```

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
an external memory system without changing the local artifact contract.
