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

## Roll Up Recent Checkpoints

If you have been checkpointing throughout a long task, create the session
crystal from those checkpoints instead of starting from a blank summary:

```bash
agent-crystallize now \
  --from-checkpoints latest \
  --body "Current state after the latest checkpoint, anything not captured yet, and next action."
```

This includes up to five recent checkpoint files as provenance anchors in the
generated crystal. The crystal should synthesize and deduplicate them; it should
not restate every checkpoint in full.

## Validate Local Crystals

Run a lightweight quality check before handoff:

```bash
agent-crystallize validate
```

Use stricter validation in CI or before public examples:

```bash
agent-crystallize validate --fail-on-warnings
```

Validation checks for:

- required sections;
- key header fields;
- empty or TODO-only current focus;
- TODO-heavy decision/finding/open-loop sections;
- resume prompts that do not point back to the artifact.

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
