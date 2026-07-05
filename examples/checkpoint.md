# Example Checkpoint

```bash
agent-crystallize checkpoint \
  --project demo \
  --surface codex \
  --body "Refactored import pipeline. Unit tests pass. Need manual check for duplicate rows next." \
  --topic "import-pipeline" \
  --decision "Keep the parser strict for this slice." \
  --finding "Fixture coverage caught one duplicate-row edge case." \
  --open-loop "Run manual duplicate-row replay check." \
  --test "npm test passed." \
  --next-action "Run replay check and update the session crystal."
```

Expected output path:

```text
.agent-crystals/checkpoints/<timestamp>-context-checkpoint-demo-<date>.md
```
