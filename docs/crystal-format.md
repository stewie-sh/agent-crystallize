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
- Topics
- Relation Hints
- Session Provenance
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
  --topic "parser" \
  --relation "depends_on:git commit abc123" \
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

## Session Provenance

Use provenance flags to attach safe pointers back to the agent session, harness,
or transcript that produced the checkpoint. These fields are pointers, not raw
transcript dumps.

```bash
agent-crystallize checkpoint \
  --surface codex \
  --agent-body codex \
  --harness codex-cli \
  --harness-version 0.130.0 \
  --session-id "$CODEX_THREAD_ID" \
  --transcript-uri "$HOME/.codex/sessions/2026/06/28/rollout-example.jsonl" \
  --source-ref "transcript:lines=1200-1450" \
  --body "Captured parser handoff with session provenance."
```

Supported provenance flags:

- `--agent-body`
- `--harness`
- `--harness-version`
- `--session-id`
- `--thread-id`
- `--run-id`
- `--conversation-id`
- `--task-id`
- `--transcript-uri`
- `--source-ref` repeatable
- `--model`
- `--provenance key=value` repeatable for harness-specific safe fields

Never pass broad environment dumps, API keys, tokens, cookies, or secret-bearing
session-env files. If a harness does not expose safe session identifiers, leave
the fields blank and capture a source ref such as a local checkpoint path, git
commit, or issue URL instead.

## Topics And Relation Hints

Topics and relation hints are intentionally lightweight. They help future tools
index or import crystals without turning this local CLI into a graph database.

Use topics for stable conceptual labels:

```bash
agent-crystallize checkpoint \
  --topic "agent-context-crystallization" \
  --topic "compaction-recovery" \
  --body "Checkpoint-aware handoff now works."
```

Use relation hints for pointers a richer memory system can interpret later:

```bash
agent-crystallize checkpoint \
  --relation "fixes:.agent-crystals/checkpoints/20260627T165406Z-quality-checkpoint-pass.md" \
  --relation "depends_on:git commit abc123" \
  --body "Validation bug fixed and verified."
```

Suggested relation types include `derived_from`, `fixes`, `supersedes`,
`validates`, `depends_on`, `relates_to`, `blocks`, `unlocks`, `contradicts`,
`generalizes`, `branches_from`, and `merged_into`.

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
- missing Session Provenance in older crystals;
- Resume Prompt that does not reference the artifact path or filename.

Use `--fail-on-warnings` when validating public examples or release fixtures.

Use repeatable `--files` to validate a clean subset instead of every historical
artifact under `.agent-crystals/`:

```bash
agent-crystallize validate \
  --files .agent-crystals/checkpoints/20260627T170254Z-context-checkpoint-demo.md \
  --files .agent-crystals/sessions/20260627T171500Z-context-crystal-demo.md \
  --fail-on-warnings
```

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
