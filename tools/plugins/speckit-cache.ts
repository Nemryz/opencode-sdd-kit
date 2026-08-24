import type { Plugin } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

type CacheEntry = {
  key: string
  tool: string
  args: any
  created: string
  expires: string
  fileHashes: Record<string, string>
  result: {
    title: string
    output: string
    metadata: any
  }
}

type CacheIndex = {
  version: number
  entries: Omit<CacheEntry, "result">[]
  stats: {
    hits: number
    misses: number
    timeSaved: number
  }
}

type PerfStats = {
  tool: string
  calls: number
  avg: number
  p95: number
  p99: number
}

type PerfData = {
  lastUpdated: string
  stats: PerfStats[]
}

const CACHE_TTL = 5 * 60 * 1000
const MAX_ENTRIES = 100
const CACHEABLE_TOOLS = ["speckit-audit", "speckit-validate", "speckit-status"]

export async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16)
  } catch {
    return "missing"
  }
}

export async function getFileHashes(worktree: string): Promise<Record<string, string>> {
  const files = [
    path.join(worktree, ".opencode", "session.json"),
    path.join(worktree, ".opencode", "spec-memory", "constitution.md"),
  ]

  const hashes: Record<string, string> = {}
  for (const file of files) {
    hashes[path.relative(worktree, file)] = await hashFile(file)
  }

  const specsDir = path.join(worktree, "specs")
  try {
    const dirs = await fs.readdir(specsDir)
    for (const dir of dirs) {
      const specJson = path.join(specsDir, dir, "spec.json")
      hashes[`specs/${dir}/spec.json`] = await hashFile(specJson)
    }
  } catch {}

  return hashes
}

export function generateCacheKey(tool: string, args: any, fileHashes: Record<string, string>): string {
  const data = JSON.stringify({ tool, args, fileHashes })
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16)
}

export async function getSlowTools(worktree: string): Promise<string[]> {
  const perfPath = path.join(worktree, ".opencode", "perf.json")
  try {
    const content = await fs.readFile(perfPath, "utf-8")
    const perf: PerfData = JSON.parse(content)
    return perf.stats
      .filter(s => s.avg > 500 || s.p95 > 1000)
      .map(s => s.tool)
  } catch {
    return []
  }
}

export function calculateCacheStats(hits: number, misses: number, timeSaved: number): {
  hitRate: string
  totalCalls: number
  timeSavedSeconds: string
} {
  const totalCalls = hits + misses
  const hitRate = totalCalls > 0
    ? ((hits / totalCalls) * 100).toFixed(1)
    : "0.0"
  return {
    hitRate,
    totalCalls,
    timeSavedSeconds: (timeSaved / 1000).toFixed(1),
  }
}

const cachePlugin: Plugin = async (input) => {
  const cacheDir = path.join(input.worktree, ".opencode", "cache")
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

  async function getCacheEntry(key: string): Promise<CacheEntry | null> {
    const entryPath = path.join(cacheDir, "entries", `${key}.json`)
    try {
      const content = await fs.readFile(entryPath, "utf-8")
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  async function setCacheEntry(entry: CacheEntry): Promise<void> {
    const entriesDir = path.join(cacheDir, "entries")
    await fs.mkdir(entriesDir, { recursive: true })
    await fs.writeFile(
      path.join(entriesDir, `${entry.key}.json`),
      JSON.stringify(entry, null, 2)
    )
  }

  return {
    "tool.execute.before": async (toolInput, toolOutput) => {
      if (!CACHEABLE_TOOLS.includes(toolInput.tool)) return

      const fileHashes = await getFileHashes(input.worktree)
      const key = generateCacheKey(toolInput.tool, toolOutput.args, fileHashes)

      const index = await readCacheIndex()
      const existing = index.entries.find(e => e.key === key)

      if (existing) {
        const entry = await getCacheEntry(key)
        if (entry && new Date(entry.expires) > new Date()) {
          index.stats.hits++
          await writeCacheIndex(index)
          toolOutput.args._cached = true
          toolOutput.args._cachedResult = entry.result
          return
        }
      }

      index.stats.misses++
      await writeCacheIndex(index)
    },

    "tool.execute.after": async (toolInput, toolOutput) => {
      if (!CACHEABLE_TOOLS.includes(toolInput.tool)) return
      if (toolOutput.args._cached) return

      const fileHashes = await getFileHashes(input.worktree)
      const key = generateCacheKey(toolInput.tool, toolOutput.args, fileHashes)

      const entry: CacheEntry = {
        key,
        tool: toolInput.tool,
        args: toolOutput.args,
        created: new Date().toISOString(),
        expires: new Date(Date.now() + CACHE_TTL).toISOString(),
        fileHashes,
        result: {
          title: toolOutput.title,
          output: toolOutput.output,
          metadata: toolOutput.metadata,
        },
      }

      await setCacheEntry(entry)

      const index = await readCacheIndex()
      index.entries = index.entries.filter(e => e.key !== key)
      index.entries.push({ ...entry, result: undefined as any })

      if (index.entries.length > MAX_ENTRIES) {
        index.entries = index.entries.slice(-MAX_ENTRIES)
      }

      await writeCacheIndex(index)
    },
  }
}

export default {
  id: "speckit-cache",
  server: cachePlugin,
}
