# Changelog

## Unreleased

- Serialize lifecycle writes and recheck source state/fingerprints inside the lock;
  preserve and report the crystal path if consolidation fails after creation.

- Add append-only local lifecycle annotations and explicit-source current-state
  synthesis. Archived/consolidated sources remain recoverable; fingerprint checks
  prevent changed rollups from silently hiding source context. See docs/lifecycle.md.

- Rank local recall by corpus term rarity and query coverage, with Unicode tokens
  and an explicit `--include-weak` fallback for partial matches.

- Doctor distinguishes custom canonical pointers and unrecognized configuration
  from recognizable generated-template drift; missing canonical targets remain visible.

- Add opt-in `doctor --updates` with bounded npm checks, local cache, update hints,
  and conservative handling of local or unknown install provenance. Never installs
  updates automatically; skill and generated protocol include awareness guidance.

### Added

- Bounded local `recall` with topic, file, session, date, and status filters.
- `doctor` drift detection plus backup-preserving `setup --upgrade` for
  generated protocol and skill copies.
- Manifest visibility for invalid artifacts and valid/active counts.
- Regression coverage for concurrent hooks, socket stdin, session isolation,
  same-second captures, invalid superseders, rollups, redaction, and nested Git
  working directories.

### Changed

- Hook state is isolated by repo and session, with serialized writes.
- Hook stdin is consumed as an async stream across file, FIFO, and socket input.
- PostCompact summaries are retained as bounded deltas after recent PreCompact
  checkpoints.
- Bootstrap, rollup, and recall prefer valid active artifacts.
- Git evidence includes staged changes and uses bounded output.
- `reviewed-shared` artifacts avoid automatically embedding absolute checkout
  roots while retaining explicit provenance under user control.
- New repo excludes cover agent-crystallize artifacts only. Existing broad
  legacy protections remain until explicit `init --migrate-excludes` review.

### Fixed

- Same-second artifacts no longer overwrite each other.
- Unknown checkpoint/crystal flags fail instead of becoming body text.
- Nested working directories no longer create fragmented `.agent-crystals`
  roots inside a Git repository.
- Common uppercase environment-style secret assignments are redacted from
  hook-derived text.
- Invalid or ambiguously named superseders cannot hide a valid artifact.
