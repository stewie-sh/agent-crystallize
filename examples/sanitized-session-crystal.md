# Context Crystal - demo-launch - 2026-07-05

## Header

- Scope: project
- Project: demo-launch
- Source window: sanitized public fixture
- Budget: standard
- Surface: codex
- Repo: /repo/agent-crystallize
- Observed at: 2026-07-05T00:00:00.000Z

## Current Focus

Prepared a public launch-readiness pass for a local-first agent context
crystallization CLI. The next session should verify package contents, run the
public-surface scan, and confirm that examples remain sanitized.

## Durable Framing

- Crystallization preserves durable work context, not hidden chain-of-thought.
- Checkpoints are mini-crystallizations: lightweight save-points for long goals
  across compaction and sessions.
- Raw sessions and tool outputs are evidence, not truth.
- Derived decisions and findings should keep provenance back to evidence.
- Topics and relation hints are lightweight metadata for later indexing, not a
  graph database.

## Checkpoint Trail

Recent checkpoints used as provenance anchors. This public fixture uses
sanitized paths and summaries instead of private session material.

- `examples/checkpoint.md`: Example Checkpoint (2026-07-05T00:00:00.000Z)
  - Focus: Refactored import pipeline. Unit tests pass. Need manual duplicate-row check next.

## Topics

- agent-context-crystallization
- launch-readiness
- compaction-recovery

## Relation Hints

- relates_to: docs/manifesto.md
- validates: examples/sanitized-session-crystal.md

## Session Provenance

- Surface: codex
- Agent body: codex
- Harness: codex-cli
- Session id: sanitized-session-example
- Source ref: examples/compaction-recovery.md
- Source ref: docs/crystal-format.md

## Decisions

- Keep generated `.agent-crystals/` artifacts local by default.
- Publish sanitized dogfood fixtures under `examples/`.
- Describe the project as local-first work-context recovery, not hidden chain-of-thought preservation.

## Findings

- A useful v0 path needs one checkpoint, one session crystal, and validation.
- Public examples should show resume state, evidence, decisions, open loops, and next actions together.

## Reality Checks

- Git commit: sanitized
- Git branch: main
- Git root: /repo/agent-crystallize

## Artifacts Changed

### Git Status

```text
(sanitized fixture; no local status captured)
```

### Diff Stat

```text
(sanitized fixture; no local diff captured)
```

### Changed Files

```text
README.md
docs/quickstart.md
docs/crystal-format.md
docs/manifesto.md
examples/sanitized-session-crystal.md
```

### Instruction Files Present

- AGENTS.md

### Evidence Pointers

- README.md
- docs/quickstart.md
- docs/crystal-format.md
- examples/compaction-recovery.md

## Tests And Verification

- `npm run check` passed in the source session.
- `agent-crystallize validate --files examples/sanitized-session-crystal.md --fail-on-warnings` should pass for this fixture.

## Open Loops

- Run `npm pack --dry-run` before publishing.
- Scan tracked files for private notes, credentials, private transcripts, and local-only artifacts.
- Confirm package metadata and install instructions before the first npm release.

## Memory Candidates

- Public launch docs should make generated local crystals private-by-default and sanitized examples public-by-intent.

## Next Actions

1. Run the build and explicit fixture validation.
2. Run package dry run and inspect included files.
3. Perform a tracked-file public-safety scan before release.

## Resume Prompt

```text
Read AGENTS.md, README.md, docs/quickstart.md, docs/crystal-format.md,
docs/manifesto.md, and examples/sanitized-session-crystal.md.

Resume from examples/sanitized-session-crystal.md, then run package validation
and the public-surface scan before release.
```
