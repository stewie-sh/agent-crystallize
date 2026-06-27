# Crystal Format

`agent-crystallize` writes Markdown files because they are easy to inspect,
commit, diff, and import into other systems later.

## Default Layout

```text
.agent-crystals/
  checkpoints/
    <timestamp>-<slug>.md
  sessions/
    <timestamp>-<slug>.md
```

## Sections

Generated artifacts include:

- Header
- Current Focus
- Durable Framing
- Checkpoint Trail
- Decisions
- Findings
- Reality Checks
- Artifacts Changed
- Tests And Verification
- Open Loops
- Memory Candidates
- Next Actions
- Resume Prompt

The initial file is intentionally editable. Fill TODO sections while the session
context is fresh.

## Checkpoint Trail

When `agent-crystallize now --from-checkpoints latest` is used, the generated
session crystal includes recent checkpoint paths, titles, observed timestamps,
and short Current Focus excerpts.

The checkpoint trail is provenance, not the final synthesis. Use it to:

- avoid repeating decisions already captured in checkpoints;
- identify what changed since the latest checkpoint;
- preserve file paths a future agent can inspect;
- focus the session crystal on open loops and resume state.

## Evidence Discipline

Treat raw transcripts, diffs, logs, and tool output as evidence, not truth.
Derived claims should preserve enough provenance for a future reader to recover
why they were written.
