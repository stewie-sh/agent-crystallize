# Local Artifact Lifecycle

Checkpoints and crystals stay on disk. Lifecycle changes are separate, append-only
JSON events in `.agent-crystals/annotations/`. The manifest is a rebuildable view;
recall and bootstrap compute the view from current files rather than trusting an
old manifest. No automatic age-based archival, deletion, or knowledge promotion runs.

## Annotate

```bash
agent-crystallize annotate --artifact .agent-crystals/checkpoints/example.md \
  --action archive --reason "Work completed; retained for audit" \
  --source-ref "review:milestone-1"
```

Use `restore` to clear archival and consolidation visibility. It does not undo
supersession. Repeat `--artifact` to annotate several sources in one event.
`consolidated`, `superseded`, `corrects`, `follows-up`, and `relates-to` require
`--target` pointing to a valid active artifact in the same project/scope.
The direction is source artifact -> target. For superseded/consolidated, target
is the replacement/rollup. For corrects/follows-up, source corrects/follows target.
Only explicit supersession changes superseded status. Descriptive relationships
do not hide artifacts or establish authority.

## Compile Current State

```bash
agent-crystallize current-state \
  --artifact .agent-crystals/checkpoints/example.md \
  --topic login \
  --body "Current agreement, verification, uncertainty and next action..." \
  --reason "Stable milestone reviewed" --source-ref "review:milestone-1"
```

The agent supplies synthesis; the CLI does not call a model. Sources must be valid,
active and share project/scope. The topic is caller-selected: this does not infer
ownership or automatically replace every other current-state artifact on that topic.
Select an earlier current state explicitly when rolling it forward. The new session
crystal links `derived_from` to sources, then one event marks them consolidated.
No source body is modified. If event creation fails after crystal creation, retain
the crystal and inspect it before retrying; source visibility is not intentionally
changed. Concurrent writers may create competing projections: review them explicitly.
Lifecycle writes are serialized with a bounded local lock and monotonic event
timestamps. Sources are rechecked inside that lock. A crashed writer can leave a
lock; timeout reports its path for owner inspection rather than deleting it blindly.
The crystal and annotation are separate durable writes, not one transaction.

## Recovery And Compatibility

`recall --include-inactive` includes archived/consolidated sources. Superseded
artifacts require the separate `--include-superseded` flag. Manifest exposes
annotations, inactive artifacts and `lifecycleIssues` for inspection.

Events carry reason, source reference, timestamp and SHA-256 fingerprints. Changed,
missing or invalid referenced files cause the event to be ignored with a diagnostic.
If a rollup is archived or damaged and no usable successor exists, its consolidated
sources become visible again. This is integrity checking, not signature verification
or a tamper-proof log. Restore disputed state with a new event; do not edit old events.

This first slice uses the default `.agent-crystals` root. Older readers ignore
annotations and may load more sources, but original Markdown remains readable.
New init/annotation writes keep annotations locally excluded for reviewed-shared
profiles too. Explicitly shared crystals still need privacy review: their source refs
can point to local artifacts that recipients cannot access. A non-Git folder has no
Git exclusion protection. Archives reduce default context loading, not disk usage.
