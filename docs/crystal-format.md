# Crystal Format

`agent-crystallize` writes Markdown files because they are easy to inspect,
commit, diff, and import into other systems later.

## Default Layout

```text
.agent-crystals/
  config.json
  checkpoints/
    <timestamp>-<slug>.md
  sessions/
    <timestamp>-<slug>.md
```

`config.json` stores the repo's stable default project name. `init --project
<slug>` creates or updates it; later CLI and hook writes use that value when no
explicit `--project` is supplied. If the config exists but cannot be parsed,
the CLI fails rather than silently drifting back to the directory basename.

In public repositories, treat this default layout as a local working area unless
the artifacts have been intentionally sanitized. This repo keeps generated
`.agent-crystals/` ignored and publishes safe examples under `examples/`.

Hook state is not stored in `.agent-crystals/` by default. `agent-crystallize
hook` keeps dedupe/activity state under `~/.agent-crystallize/hooks` unless
`--state-dir` is supplied.

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

## Continuity Tail

`## Continuity Tail` is optional raw continuity evidence for recovering local
conversation flow after compaction or cross-harness handoff. It is intentionally
lower-authority than distilled sections.

Use it when:

- the last few user/assistant turns contain nuance that a compaction summary may
  drop;
- a future agent needs turn order to understand what changed;
- the content is useful but not ready to become a decision, finding, memory
  candidate, or rule.

Do not use it to dump full transcripts. Prefer transcript pointers for large
source material.

```bash
agent-crystallize checkpoint \
  --body "Ready to compact after debugging deployment hooks." \
  --continuity-tail "user: The hook failed only after I skipped /hooks review." \
  --continuity-tail "assistant: Treat Codex hook trust and runtime PATH as separate failure layers." \
  --continuity-tail-max-chars 8000
```

Continuity entries are redacted for common secrets and assigned a short
sha256-based dedupe hash. Restore precedence:

1. Latest user instruction.
2. Harness compaction summary.
3. Distilled checkpoint/crystal state.
4. Continuity Tail for nuance and ordering.

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

## Superseded Intermediate Artifacts

Checkpoints and crystals often capture raw intermediate work. When a commit,
public doc, decision log, or fuller crystal supersedes that intermediate trace,
keep the old artifact for debugging and provenance but route normal resume flows
to the newer source of truth.

Use relation hints to make that explicit:

```bash
agent-crystallize now \
  --relation "supersedes:.agent-crystals/checkpoints/20260705T120000Z-precompact-checkpoint.md" \
  --relation "validates:git commit abc123" \
  --body "Commit abc123 is now the source of truth for this completed slice."
```

Future manifest/index views should be able to hide superseded intermediate
artifacts by default while keeping them available for trace and debugging.

## Manifest

Use `agent-crystallize manifest` to build a lightweight local index of generated
artifacts:

```bash
agent-crystallize manifest --write
```

The manifest reports active artifacts separately from superseded artifacts. By
default, superseded artifacts are counted but omitted from the main JSON output;
use `--include-superseded` when auditing trace/debug history.

Normal resume flows should prefer active artifacts. Superseded checkpoints are
still useful as evidence, but they should not crowd the first context an agent
loads after a fresh session or compaction.

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
- duplicate recognized sections;
- recognized sections outside canonical order;
- missing key header fields;
- empty or TODO-only Current Focus.

The CLI escapes H1/H2-looking lines inside free-form payloads so session prose
cannot accidentally become crystal structure. Validators still reject duplicate
or out-of-order recognized headings in manually edited or externally generated
files. Consumers should validate before importing any crystal as structured
data; parseable narration is still untrusted evidence.

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
  --files examples/sanitized-session-crystal.md \
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
