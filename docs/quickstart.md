# Quickstart

## Create A Checkpoint

Use checkpoints as mini-crystallizations during long-running work:

```bash
agent-crystallize checkpoint \
  --body "Implemented payment callback parsing. Build passes. Need webhook replay test next."
```

This writes a Markdown file under:

```text
.agent-crystals/checkpoints/
```

## Create A Session Crystal

Use a fuller crystal before handoff, compaction, or session end:

```bash
agent-crystallize now \
  --project my-product \
  --budget standard \
  --body "Summarize the current state, decisions, open loops, and next action."
```

This writes under:

```text
.agent-crystals/sessions/
```

## Suggested Cadence

Checkpoint after:

- major user decisions;
- implementation slices;
- failed tests or reality checks;
- build/deploy results that matter;
- cross-agent handoff;
- before compaction or session end.

Do not wait until the context window is nearly full. Checkpoints bound the amount
of work lost to unexpected compaction.
