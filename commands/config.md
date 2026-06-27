---
description: Read or update SDD configuration (tech stack defaults, preferences)
---

## Task

1. Call the `speckit-config` tool to read or update configuration
2. If $ARGUMENTS contains `defaultTechStack=<value>`, pass `defaultTechStack` with the value
3. If $ARGUMENTS contains `key=<key> value=<value>`, pass both to set a preference
4. If $ARGUMENTS is empty, show the current config

## Examples

- `/config` — show all settings
- `/config defaultTechStack=Node.js+PostgreSQL+React` — set default tech stack
- `/config key=language value=python` — set a preference

$ARGUMENTS
