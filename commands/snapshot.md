---
description: Manage point-in-time snapshots (create, list, verify, preview, restore, pin, drill, prune, recover)
---

Manage SDD state snapshots by calling the `speckit-snapshot` tool.

## Task

1. Map `$ARGUMENTS` to the tool call:
   - empty or `list` → subcommand `list`: Recovery Readiness verdict plus every snapshot with status, pin, and drill result
   - `create` → subcommand `create`: capture the current state (feature and phase are recorded from session.json)
   - `verify <id>` → subcommand `verify` with `id` (accepts `latest`)
   - `preview <id> [--files a,b]` → subcommand `preview` with `id`, `mode: "selective"` and `files` when paths are given
   - `restore <id> [--files a,b]` → subcommand `restore`: ask the user to confirm first (the tool reports the impact), then re-run with `confirmed: true`
   - `pin <id> [label]` / `unpin <id>` → subcommand `pin` (with `label`) or `unpin`
   - `drill <id>` → subcommand `drill`: rehearse the restore in a sandbox and record the result
   - `prune` → subcommand `prune`: apply retention caps
   - `recover` → subcommand `recover`: roll back an interrupted restore from its journal
2. Call `speckit-snapshot` with the mapped arguments
3. Report the result clearly: readiness verdict, snapshot id, what changed, and the suggested next step

## Rules

- Never pass `confirmed: true` without explicit user confirmation
- Recommend `preview` before a restore and `drill` after a create
- If `list` reports an interrupted restore, run `recover` before anything else
- Never claim success when `prune` aborts or a restore rolls back — report the actual outcome
