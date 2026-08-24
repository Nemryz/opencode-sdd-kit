import { tool } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import path from "node:path"
import { isValidProjectRoot, getProjectRootWarnings } from "./shared/types"

type CacheIndex = {
  version: number
  entries: Array<{
    key: string
    tool: string
    args: any
    created: string
    expires: string
    fileHashes: Record<string, string>
  }>
  stats: {
    hits: number
    misses: number
    timeSaved: number
  }
}

const MAX_ENTRIES = 100

function calculateStats(index: CacheIndex): {
  hitRate: string
  totalCalls: number
  timeSavedSeconds: string
} {
  const totalCalls = index.stats.hits + index.stats.misses
  const hitRate = totalCalls > 0
    ? ((index.stats.hits / totalCalls) * 100).toFixed(1)
    : "0.0"
  return {
    hitRate,
    totalCalls,
    timeSavedSeconds: (index.stats.timeSaved / 1000).toFixed(1),
  }
}

function formatOutput(index: CacheIndex): string {
  const stats = calculateStats(index)

  const toolStats = new Map<string, number>()
  for (const entry of index.entries) {
    toolStats.set(entry.tool, (toolStats.get(entry.tool) || 0) + 1)
  }

  const lines = [
    "Cache Statistics (TTL: 5 minutes, configurable via /config cache_ttl=<ms>)",
    "",
    "  Performance Impact:",
    `    Total calls: ${stats.totalCalls}`,
    `    Cache hits: ${index.stats.hits} (${stats.hitRate}%)`,
    `    Cache misses: ${index.stats.misses}`,
    `    Time saved: ${stats.timeSavedSeconds}s`,
    "",
    "  By Tool:",
  ]

  for (const [tool, count] of toolStats) {
    lines.push(`    ${tool}: ${count} entries`)
  }

  if (toolStats.size === 0) {
    lines.push("    (no entries)")
  }

  lines.push("")
  lines.push("  Storage:")
  lines.push(`    Entries: ${index.entries.length}/${MAX_ENTRIES}`)

  return lines.join("\n")
}

export default tool({
  description: "Manage smart cache for performance optimization",
  args: {
    subcommand: tool.schema.enum(["status", "clear"]).optional().describe("Cache subcommand (status, clear)"),
    tool: tool.schema.string().optional().describe("Tool name for clear <tool>"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!await isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }

      const projectWarnings = await getProjectRootWarnings(projectRoot)
      if (projectWarnings.length > 0) {
        return {
          title: "Warning",
          output: projectWarnings.map(w => w.message).join("\n\n"),
          metadata: { warnings: projectWarnings, requiresConfirmation: true },
        }
      }

      const cacheDir = path.join(projectRoot, ".opencode", "cache")
      const cacheIndexPath = path.join(cacheDir, "cache.json")

      async function readCacheIndex(): Promise<CacheIndex> {
        try {
          const content = await fs.readFile(cacheIndexPath, "utf-8")
          return JSON.parse(content)
        } catch {
          return { version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } }
        }
      }

      async function writeCacheIndex(index: CacheIndex): Promise<void> {
        await fs.mkdir(cacheDir, { recursive: true })
        await fs.writeFile(cacheIndexPath, JSON.stringify(index, null, 2))
      }

      async function clearCacheEntries(toolName?: string): Promise<number> {
        const entriesDir = path.join(cacheDir, "entries")
        await fs.mkdir(entriesDir, { recursive: true })
        let cleared = 0
        try {
          const files = await fs.readdir(entriesDir)
          for (const file of files) {
            if (!file.endsWith(".json")) continue
            if (toolName) {
              const content = await fs.readFile(path.join(entriesDir, file), "utf-8")
              const entry = JSON.parse(content)
              if (entry.tool === toolName) {
                await fs.unlink(path.join(entriesDir, file))
                cleared++
              }
            } else {
              await fs.unlink(path.join(entriesDir, file))
              cleared++
            }
          }
        } catch {}
        return cleared
      }

      const subcommand = args.subcommand || "status"

      if (subcommand === "status") {
        const index = await readCacheIndex()
        await writeCacheIndex(index)
        return {
          title: "Cache Status",
          output: formatOutput(index),
        }
      }

      if (subcommand === "clear") {
        return {
          title: "Confirm Cache Clear",
          output: args.tool
            ? `Clear cache for ${args.tool}? This will remove all cached results for this tool.`
            : "Clear all cache? This will remove all cached results.",
          metadata: {
            requiresConfirmation: true,
            onConfirm: async () => {
              const cleared = await clearCacheEntries(args.tool)
              const index = await readCacheIndex()
              if (args.tool) {
                index.entries = index.entries.filter(e => e.tool !== args.tool)
              } else {
                index.entries = []
                index.stats = { hits: 0, misses: 0, timeSaved: 0 }
              }
              await writeCacheIndex(index)
              return {
                title: "Cache Cleared",
                output: args.tool
                  ? `Cache cleared for ${args.tool}. Removed ${cleared} entries.`
                  : `All cache cleared. Removed ${cleared} entries.`,
              }
            },
          },
        }
      }

      return {
        title: "Error",
        output: "Unknown subcommand. Use /cache status or /cache clear.",
      }
    } catch (err) {
      return {
        title: "Error",
        output: `Cache operation failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
})
