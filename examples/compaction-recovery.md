# Compaction Recovery Flow

This example shows the intended shape of a long coding-agent session.

## 1. Checkpoint After Meaningful Work

```bash
agent-crystallize checkpoint \
  --project demo \
  --surface codex \
  --body "Finished import parser refactor. Unit tests pass. Need replay test for duplicate rows next."
```

This creates:

```text
.agent-crystals/checkpoints/<timestamp>-context-checkpoint-demo-<date>.md
```

Use checkpoints after:

- a user decision;
- a test result;
- a bug or recovery;
- an implementation slice;
- a handoff or likely compaction point.

## 2. Create A Checkpoint-Aware Session Crystal

Before compaction or handoff:

```bash
agent-crystallize now \
  --project demo \
  --surface codex \
  --from-checkpoints latest \
  --body "Ready to compact. Parser refactor is done. Next session should run replay tests and inspect duplicate-row behavior."
```

This creates:

```text
.agent-crystals/sessions/<timestamp>-context-crystal-demo-<date>.md
```

The session crystal includes a `Checkpoint Trail` section with recent
checkpoints as provenance anchors.

## 3. Resume From The Crystal

A future agent can start from the generated resume prompt:

```text
Read AGENTS.md if present, then read the latest session crystal under
.agent-crystals/sessions/.

Resume from Current Focus, Checkpoint Trail, Open Loops, and Next Actions.
```

## What This Preserves

The goal is not to keep every token from the prior chat. The goal is to preserve
enough work context to continue safely:

- what changed;
- why it mattered;
- what evidence exists;
- what remains open;
- what the next action should be.
