---
description: Show current workflow phase and artifact status
---

## Task

1. Call the `speckit-status` tool to get a concise status report
2. If the tool output says "No features yet", suggest `/spec <description>`
3. Otherwise, report the phase and next step based on the tool output

## Output format

Single line, following the concise output rule:
`"Phase: [phase] | [N] feature(s) | Next: [next command]"`

## Guidance for next step

- If no constitution → `/spec <description>`
- If constitution exists but no spec → `/spec <description>`
- If spec exists but no plan → `/plan <tech stack>`
- If plan exists but no tasks → `/tasks`
- If all artifacts exist → `/impl` or `/review`
