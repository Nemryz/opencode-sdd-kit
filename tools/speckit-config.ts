import { tool } from "@opencode-ai/plugin"
import {
  configPath,
  isValidProjectRoot,
  SDDConfig,
  DEFAULT_CONFIG,
  withLock,
} from "./shared/types"
import fs from "node:fs/promises"
import path from "node:path"

async function readConfig(root: string): Promise<SDDConfig> {
  try {
    const data = await fs.readFile(configPath(root), "utf-8")
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

async function writeConfig(root: string, cfg: SDDConfig): Promise<void> {
  const fp = configPath(root)
  const dir = path.dirname(fp)
  await fs.mkdir(dir, { recursive: true })
  await withLock(fp, async () => {
    await fs.writeFile(fp, JSON.stringify(cfg, null, 2), "utf-8")
  })
}

export default tool({
  description: "Read or update SDD configuration (tech stack defaults, preferences)",
  args: {
    key: tool.schema.string().optional().describe("Config key to read or set"),
    value: tool.schema.string().optional().describe("Value to set (omit to read current)"),
    defaultTechStack: tool.schema.string().optional().describe("Set default tech stack for /plan"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }
      const cfg = await withLock(configPath(projectRoot), async () => {
        const innerCfg = await readConfig(projectRoot)
        if (args.defaultTechStack !== undefined) {
          innerCfg.defaultTechStack = args.defaultTechStack ?? null
          await writeConfig(projectRoot, innerCfg)
        } else if (args.key && args.value !== undefined) {
          innerCfg.preferences[args.key] = args.value
          innerCfg.lastUsedLanguage = args.key === "language" ? args.value : innerCfg.lastUsedLanguage
          await writeConfig(projectRoot, innerCfg)
        }
        return innerCfg
      })

      if (args.defaultTechStack !== undefined) {
        return {
          title: "Configuration updated",
          output: `defaultTechStack: ${cfg.defaultTechStack ?? "(not set)"}`,
          metadata: cfg,
        }
      }

      if (args.key && args.value !== undefined) {
        return {
          title: "Configuration updated",
          output: `${args.key}: ${args.value}`,
          metadata: cfg,
        }
      }

      if (args.key) {
        const knownKeys: Record<string, string | null> = {
          defaultTechStack: cfg.defaultTechStack,
          lastUsedLanguage: cfg.lastUsedLanguage,
        }
        const raw = cfg.preferences[args.key] ?? knownKeys[args.key]
        return {
          title: "Configuration read",
          output: `${args.key}: ${raw ?? "(not set)"}`,
          metadata: cfg,
        }
      }

      const lines = [
        `defaultTechStack: ${cfg.defaultTechStack ?? "(not set)"}`,
        `lastUsedLanguage: ${cfg.lastUsedLanguage ?? "(not set)"}`,
        `preferences: ${Object.keys(cfg.preferences).length} key(s)`,
      ]

      return {
        title: "SDD Configuration",
        output: lines.join(" | "),
        metadata: cfg,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `config: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
