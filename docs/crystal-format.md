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

## Structured Fields

The CLI can fill common sections directly:

```bash
agent-crystallize now \
  --body "Ready to hand off parser work." \
  --decision "Keep parser strict for v0." \
  --finding "Replay coverage is still the main risk." \
  --open-loop "Run duplicate-row replay test." \
  --test "npm test passed." \
  --next-action "Run replay test before compaction." \
  --evidence "git commit abc123" \
  --memory-candidate "Strict parser behavior should be reused in future callback work."
```

Each structured flag is repeatable. Use them when you already know the decision,
finding, open loop, test result, next action, evidence pointer, or memory
candidate at capture time.

## Validation

Run:

```bash
agent-crystallize validate
```

Validation is intentionally simple and local. It checks whether crystals contain
the expected sections and enough resume-critical content to be useful after
handoff or compaction.

Errors include:

- missing title;
- missing required sections;
- missing key header fields;
- empty or TODO-only Current Focus.

Warnings include:

- TODO-only Decisions, Findings, Tests And Verification, Open Loops, or Memory
  Candidates;
- Resume Prompt that does not reference the artifact path or filename.

Use `--fail-on-warnings` when validating public examples or release fixtures.

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
