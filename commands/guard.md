---
description: Manage the file protection guard (status, on/off, add/remove, log, debug)
---

Manage the file protection guard by calling the `speckit-guard` tool.

## Task

1. Map `$ARGUMENTS` to the tool call:
   - empty or `status` → subcommand `status`: show ENABLED/DISABLED, debug state, protected lists, stats, recent denials
   - `on` → subcommand `on`
   - `off` → subcommand `off`: ask the user to confirm first, then re-run with `confirmed: true`
   - `add <file>` → subcommand `add` with `file`
   - `remove <file>` → subcommand `remove` with `file`: ask the user to confirm first, then re-run with `confirmed: true`
   - `log` → subcommand `log` (recent denials); `log all` → subcommand `log` with `logOption: "all"`
   - `debug on` / `debug off` → subcommand `debug` with `debugOption`
2. Call `speckit-guard` with the mapped arguments
3. Report the result clearly: guard state, debug state, and exactly what changed (or that nothing changed)

## Rules

- Never pass `confirmed: true` without explicit user confirmation
- If the tool reports a file is protected dynamically (after approval / by phase) or by pattern, explain the correct path: edit the artifact and re-approve with `/approve <artifact>`, or use a temporary guard off only when strictly needed — never claim a removal succeeded when nothing changed
