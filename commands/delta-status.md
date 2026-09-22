---
description: Show the status of incremental delta specs for a feature
---

Call the `speckit-delta` tool with `command: "delta-status"` and report the results.

## Task

1. Call `speckit-delta` with `command: "delta-status"`; if `$ARGUMENTS` names a feature directory, pass it as `featureDir`
2. Report each delta: id, type, status, impact, and its next step (`/plan-delta`, `/tasks-delta`, `/impl-delta`)
3. If no deltas exist, say so explicitly and suggest `/spec-delta <description>` to create one
