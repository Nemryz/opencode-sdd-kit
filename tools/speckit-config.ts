import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"

interface SDDConfig {
  defaultTechStack: string | null
  lastUsedLanguage: string | null
  preferences: Record<string, string>
}

const DEFAULT_CONFIG: SDDConfig = {
  defaultTechStack: null,
  lastUsedLanguage: null,
  preferences: {},
}

function configPath(root: string): string {
  return path.join(root, ".opencode", "spec-memory", "config.json")
}

async function readConfig(root: string): Promise<SDDConfig> {
  try {
    const data = await fs.readFile(configPath(root), "utf-8")
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

async function writeConfig(root: string, cfg: SDDConfig): Promise<void> {
  const dir = path.join(root, ".opencode", "spec-memory")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(configPath(root), JSON.stringify(cfg, null, 2), "utf-8")
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
      const cfg = await readConfig(projectRoot)

      if (args.defaultTechStack !== undefined) {
        cfg.defaultTechStack = args.defaultTechStack ?? null
        await writeConfig(projectRoot, cfg)
        return {
          title: "Configuration updated",
          output: `defaultTechStack: ${cfg.defaultTechStack ?? "(not set)"}`,
          metadata: cfg,
        }
      }

      if (args.key && args.value !== undefined) {
        cfg.preferences[args.key] = args.value
        cfg.lastUsedLanguage = args.key === "language" ? args.value : cfg.lastUsedLanguage
        await writeConfig(projectRoot, cfg)
        return {
          title: "Configuration updated",
          output: `${args.key}: ${args.value}`,
          metadata: cfg,
        }
      }

      if (args.key) {
        const raw = cfg.preferences[args.key] ?? (cfg as Record<string, unknown>)[args.key] ?? null
        const val = typeof raw === "object" ? JSON.stringify(raw) : raw
        return {
          title: "Configuration read",
          output: `${args.key}: ${val ?? "(not set)"}`,
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
