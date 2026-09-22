---
description: Check SDD state file integrity and restore corrupted files from backups
---

Call the `speckit-health` tool and report the results clearly.

## Task

1. Call `speckit-health` (without `fix`) to inspect session.json, config.json, and each feature's spec.json
2. If `$ARGUMENTS` includes `--fix`, call `speckit-health` with `fix: true` to restore corrupted or missing files from the latest valid backup
3. Report:
   - Overall status: HEALTHY / DEGRADED / CRITICAL
   - Per-file status: healthy / corrupted / missing / restored
   - Corruption warnings with their suggested recovery action
   - Which files were restored and from which backup
