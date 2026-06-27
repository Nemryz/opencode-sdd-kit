---
description: Scan all features and fix artifacts inconsistencies
---

## Task

1. Call the `speckit-clean` tool with `fix: true` to detect and auto-repair inconsistencies
2. If the user passes `--dry-run` in $ARGUMENTS, call without `fix` (report only)
3. Report the results to the user: how many features are ok, incomplete, or orphan
4. If there are orphan features (empty dirs), suggest running `/spec <desc>` to create new ones

$ARGUMENTS (use `--dry-run` for report only)
