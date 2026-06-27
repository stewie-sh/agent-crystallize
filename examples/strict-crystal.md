# Strict Crystal Example

This example fills the sections that `agent-crystallize validate
--fail-on-warnings` checks.

```bash
agent-crystallize now \
  --project demo \
  --surface codex \
  --body "Parser refactor is complete. The next session should verify replay behavior before handoff." \
  --decision "Keep parser strict for v0; reject ambiguous callback payloads." \
  --finding "Fixture coverage caught one duplicate-row edge case." \
  --open-loop "Run production-like webhook replay test." \
  --test "npm test passed." \
  --next-action "Run replay test and update the crystal if behavior changes." \
  --evidence "git commit abc123" \
  --memory-candidate "Strict parser behavior should be reused in future callback work."
```

Then validate:

```bash
agent-crystallize validate --fail-on-warnings
```
