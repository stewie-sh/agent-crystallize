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
  --body "Current state after the latest checkpoint, anything not captured yet, and next action." \
  --topic "import-pipeline" \
  --relation "depends_on:git commit abc123" \
  --decision "Keep the import pipeline local-first in this slice." \
  --finding "Replay coverage is the main remaining risk." \
  --open-loop "Run webhook replay test before handoff." \
  --test "npm test passed." \
  --next-action "Run replay test and update the session crystal." \
  --memory-candidate "Replay coverage is a durable release-quality signal."
```

This includes up to five recent checkpoint files as provenance anchors in the
generated crystal. The crystal should synthesize and deduplicate them; it should
not restate every checkpoint in full.

## Fill Structured Sections

Use repeatable structured flags to avoid TODO-heavy artifacts:

```bash
agent-crystallize checkpoint \
  --body "Finished payment callback parsing." \
  --topic "payment-callbacks" \
  --relation "relates_to:examples/strict-crystal.md" \
  --decision "Keep parser strict; reject ambiguous callback payloads." \
  --finding "Fixture coverage caught one duplicate-row edge case." \
  --open-loop "Replay production-like webhook payloads." \
  --test "npm test passed." \
  --next-action "Run webhook replay test." \
  --memory-candidate "Webhook replay should be part of future handoff checks."
```

Available structured flags:

- `--decision`
- `--finding`
- `--open-loop`
- `--test`
- `--next-action`
- `--evidence`
- `--memory-candidate`
- `--topic`
- `--tag`
- `--relation type:target`

## Validate Local Crystals

Run a lightweight quality check before handoff:

```bash
agent-crystallize validate
```

Use stricter validation in CI or before public examples:

```bash
agent-crystallize validate --fail-on-warnings
```

Validate only a clean subset when old or experimental crystals exist:

```bash
agent-crystallize validate \
  --files .agent-crystals/checkpoints/20260627T170254Z-context-checkpoint-demo.md \
  --files .agent-crystals/sessions/20260627T171500Z-context-crystal-demo.md \
  --fail-on-warnings
```

Validation checks for:

- required sections;
- key header fields;
- empty or TODO-only current focus;
- TODO-heavy decision/finding/open-loop sections;
- TODO-heavy memory-candidate sections;
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
