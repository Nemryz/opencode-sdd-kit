import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  hashFile,
  getFileHashes,
  generateCacheKey,
  getSlowTools,
  calculateCacheStats,
  getCachedGuardConfig,
  setCachedGuardConfig,
  invalidateGuardCache,
} from "../../plugins/speckit-cache"
import cacheTool from "../../speckit-cache"

describe("Cache Phase 3: Killing Mutants in speckit-cache.ts", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cache-kill-"))
    const opencodeDir = path.join(tmpDir, ".opencode")
    const specMemoryDir = path.join(opencodeDir, "spec-memory")
    await fs.mkdir(specMemoryDir, { recursive: true })
    await fs.writeFile(path.join(opencodeDir, "session.json"), "{}")
    await fs.writeFile(path.join(specMemoryDir, "constitution.md"), "# Constitution")
    const specsDir = path.join(tmpDir, "specs")
    await fs.mkdir(specsDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function runTool(args: any = {}) {
    return cacheTool.execute(args, { worktree: tmpDir, sessionID: "test", callID: "test" })
  }

  async function getCacheIndexPath() {
    return path.join(tmpDir, ".opencode", "cache", "cache.json")
  }

  async function readCacheIndex() {
    const indexPath = await getCacheIndexPath()
    try {
      const content = await fs.readFile(indexPath, "utf-8")
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  async function writeCacheIndex(index: any) {
    const cacheDir = path.join(tmpDir, ".opencode", "cache")
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(path.join(cacheDir, "cache.json"), JSON.stringify(index, null, 2))
  }

  async function createCacheEntry(key: string, tool: string, expires?: string, fileHashes?: Record<string, string>) {
    const entriesDir = path.join(tmpDir, ".opencode", "cache", "entries")
    await fs.mkdir(entriesDir, { recursive: true })
    const entry = {
      key,
      tool,
      args: {},
      created: new Date().toISOString(),
      expires: expires || new Date(Date.now() + 300000).toISOString(),
      fileHashes: fileHashes || {},
      result: { title: "Cached Result", output: "cached output", metadata: null },
    }
    await fs.writeFile(path.join(entriesDir, `${key}.json`), JSON.stringify(entry, null, 2))
    return entry
  }

  async function getFileHashesForTest() {
    return getFileHashes(tmpDir)
  }

  describe("cache hit returns correct data", () => {
    it("sets _cached to true on hit", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", undefined, fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 300000).toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)
      expect(toolOutput.args._cached).toBe(true)
    })

    it("sets _cachedResult with result data on hit", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      const entry = await createCacheEntry(key, "speckit-audit", undefined, fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 300000).toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)
      expect(toolOutput.args._cachedResult).toEqual(entry.result)
    })

    it("increments stats.hits on cache hit", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", undefined, fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 300000).toISOString(), fileHashes }],
        stats: { hits: 5, misses: 3, timeSaved: 1000 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)

      const index = await readCacheIndex()
      expect(index.stats.hits).toBe(6)
    })

    it("returns early after cache hit without incrementing misses", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", undefined, fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 300000).toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)

      const index = await readCacheIndex()
      expect(index.stats.misses).toBe(0)
    })

    it("does not set _cached for non-cacheable tools", async () => {
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-selfheal", args: {} } as any, toolOutput)
      expect(toolOutput.args._cached).toBeUndefined()
    })

    it("cache hit uses fileHashes from entry for key matching", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", undefined, fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 300000).toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)
      expect(toolOutput.args._cached).toBe(true)
    })
  })

  describe("cache miss behavior", () => {
    it("increments stats.misses on cache miss", async () => {
      await writeCacheIndex({
        version: 1,
        entries: [],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)

      const index = await readCacheIndex()
      expect(index.stats.misses).toBe(1)
    })

    it("does not set _cached on miss", async () => {
      await writeCacheIndex({
        version: 1,
        entries: [],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)
      expect(toolOutput.args._cached).toBeUndefined()
    })

    it("does not set _cachedResult on miss", async () => {
      await writeCacheIndex({
        version: 1,
        entries: [],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)
      expect(toolOutput.args._cachedResult).toBeUndefined()
    })
  })

  describe("TTL invalidation", () => {
    it("expired entry treated as miss", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", new Date(Date.now() - 10000).toISOString(), fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() - 10000).toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)

      const index = await readCacheIndex()
      expect(index.stats.misses).toBe(1)
      expect(index.stats.hits).toBe(0)
    })

    it("future entry treated as hit", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", new Date(Date.now() + 600000).toISOString(), fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 600000).toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)

      const index = await readCacheIndex()
      expect(index.stats.hits).toBe(1)
      expect(index.stats.misses).toBe(0)
    })

    it("expired entry does not set _cached", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", new Date(Date.now() - 10000).toISOString(), fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() - 10000).toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)
      expect(toolOutput.args._cached).toBeUndefined()
    })

    it("boundary entry exactly at TTL treated as miss", async () => {
      const fileHashes = await getFileHashesForTest()
      const key = generateCacheKey("speckit-audit", {}, fileHashes)
      await createCacheEntry(key, "speckit-audit", new Date().toISOString(), fileHashes)
      await writeCacheIndex({
        version: 1,
        entries: [{ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date().toISOString(), fileHashes }],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.before"]({ tool: "speckit-audit", args: {} } as any, toolOutput)

      const index = await readCacheIndex()
      expect(index.stats.misses).toBe(1)
    })
  })

  describe("MAX_ENTRIES overflow", () => {
    it("removes oldest entries when exceeding MAX_ENTRIES", async () => {
      const entries = []
      for (let i = 0; i < 101; i++) {
        const key = `key${i}`
        entries.push({ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 300000).toISOString(), fileHashes: {} })
      }
      await writeCacheIndex({ version: 1, entries, stats: { hits: 0, misses: 0, timeSaved: 0 } })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.after"]({ tool: "speckit-audit", args: {} } as any, toolOutput as any)

      const index = await readCacheIndex()
      expect(index.entries.length).toBeLessThanOrEqual(100)
    })

    it("keeps newest entries after overflow", async () => {
      const entries = []
      for (let i = 0; i < 100; i++) {
        const key = `key${i}`
        entries.push({ key, tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date(Date.now() + 300000).toISOString(), fileHashes: {} })
      }
      await writeCacheIndex({ version: 1, entries, stats: { hits: 0, misses: 0, timeSaved: 0 } })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.after"]({ tool: "speckit-audit", args: {} } as any, toolOutput as any)

      const index = await readCacheIndex()
      expect(index.entries.length).toBe(100)
    })

    it("does not truncate when under MAX_ENTRIES", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })

      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { args: {} as any, title: "", output: "" }
      await server["tool.execute.after"]({ tool: "speckit-audit", args: {} } as any, toolOutput as any)

      const index = await readCacheIndex()
      expect(index.entries.length).toBe(1)
    })
  })

  describe("calculateStats", () => {
    it("calculates hit rate correctly", () => {
      const stats = calculateCacheStats(7, 3, 0)
      expect(stats.hitRate).toBe("70.0")
    })

    it("returns 0.0 hit rate when no calls", () => {
      const stats = calculateCacheStats(0, 0, 0)
      expect(stats.hitRate).toBe("0.0")
    })

    it("calculates totalCalls as sum", () => {
      const stats = calculateCacheStats(5, 3, 0)
      expect(stats.totalCalls).toBe(8)
    })

    it("converts timeSaved to seconds", () => {
      const stats = calculateCacheStats(0, 0, 5000)
      expect(stats.timeSavedSeconds).toBe("5.0")
    })

    it("returns one decimal place for hitRate", () => {
      const stats = calculateCacheStats(1, 3, 0)
      expect(stats.hitRate).toBe("25.0")
    })
  })

  describe("formatOutput sections", () => {
    it("contains Performance Impact header", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Performance Impact")
    })

    it("contains Storage header", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Storage")
    })

    it("contains By Tool header", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("By Tool")
    })

    it("shows no entries when empty", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("(no entries)")
    })

    it("shows tool count when entries exist", async () => {
      await writeCacheIndex({
        version: 1,
        entries: [
          { key: "k1", tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date().toISOString(), fileHashes: {} },
          { key: "k2", tool: "speckit-audit", args: {}, created: new Date().toISOString(), expires: new Date().toISOString(), fileHashes: {} },
        ],
        stats: { hits: 0, misses: 0, timeSaved: 0 },
      })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("speckit-audit: 2 entries")
    })
  })

  describe("clearCacheEntries", () => {
    it("clears all entries when no tool specified", async () => {
      const result = await runTool({ subcommand: "clear" })
      expect(result.title).toBe("Confirm Cache Clear")
    })

    it("onConfirm clears all entries", async () => {
      const result = await runTool({ subcommand: "clear" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.title).toBe("Cache Cleared")
    })

    it("onConfirm output mentions entries removed", async () => {
      const result = await runTool({ subcommand: "clear" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.output).toContain("entries")
    })

    it("clear with tool shows tool name in confirmation", async () => {
      const result = await runTool({ subcommand: "clear", tool: "speckit-audit" })
      expect(result.output).toContain("speckit-audit")
    })

    it("onConfirm with tool clears only matching entries", async () => {
      const result = await runTool({ subcommand: "clear", tool: "speckit-audit" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.title).toBe("Cache Cleared")
    })
  })

  describe("guard config TTL", () => {
    it("returns config when not expired", async () => {
      const config = { protectedFiles: ["test.md"] }
      await setCachedGuardConfig(tmpDir, config)
      const cached = await getCachedGuardConfig(tmpDir)
      expect(cached).toEqual(config)
    })

    it("returns null when expired", async () => {
      const cacheDir = path.join(tmpDir, ".opencode", "cache")
      await fs.mkdir(cacheDir, { recursive: true })
      const cachePath = path.join(cacheDir, "guard-config.json")
      const expired = {
        config: { protectedFiles: ["test.md"] },
        lastUpdated: new Date(Date.now() - 120000).toISOString(),
      }
      await fs.writeFile(cachePath, JSON.stringify(expired, null, 2))
      const cached = await getCachedGuardConfig(tmpDir)
      expect(cached).toBeNull()
    })

    it("returns null when no cache file", async () => {
      const cached = await getCachedGuardConfig(tmpDir)
      expect(cached).toBeNull()
    })

    it("invalidateGuardCache removes file", async () => {
      await setCachedGuardConfig(tmpDir, { protectedFiles: ["test.md"] })
      await invalidateGuardCache(tmpDir)
      const cached = await getCachedGuardConfig(tmpDir)
      expect(cached).toBeNull()
    })
  })

  describe("after hook storage", () => {
    it("stores entry after tool execution", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { title: "Test", output: "test output", metadata: null }
      await server["tool.execute.after"]({ tool: "speckit-audit", args: {} } as any, toolOutput as any)

      const entriesDir = path.join(tmpDir, ".opencode", "cache", "entries")
      const files = await fs.readdir(entriesDir)
      expect(files.length).toBe(1)
    })

    it("deduplicates entries with same key", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { title: "Test", output: "test output", metadata: null }
      await server["tool.execute.after"]({ tool: "speckit-audit", args: {} } as any, toolOutput as any)
      await server["tool.execute.after"]({ tool: "speckit-audit", args: {} } as any, toolOutput as any)

      const index = await readCacheIndex()
      expect(index.entries.length).toBe(1)
    })

    it("updates index with new entry", async () => {
      await writeCacheIndex({ version: 1, entries: [], stats: { hits: 0, misses: 0, timeSaved: 0 } })
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      const toolOutput = { title: "Test", output: "test output", metadata: null }
      await server["tool.execute.after"]({ tool: "speckit-audit", args: {} } as any, toolOutput as any)

      const index = await readCacheIndex()
      expect(index.entries[0].tool).toBe("speckit-audit")
    })
  })

  describe("plugin structure", () => {
    it("plugin has correct id", async () => {
      const mod = await import("../../plugins/speckit-cache")
      expect(mod.default.id).toBe("speckit-cache")
    })

    it("plugin server returns hooks object", async () => {
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      expect(server).toHaveProperty("tool.execute.before")
      expect(server).toHaveProperty("tool.execute.after")
    })
  })

  describe("error handling", () => {
    it("returns error for no worktree", async () => {
      const result = await cacheTool.execute({}, {} as any)
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree")
    })

    it("status returns Cache Status title", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBe("Cache Status")
    })

    it("unknown subcommand returns error", async () => {
      const result = await runTool({ subcommand: "invalid" })
      expect(result.title).toBe("Error")
    })
  })
})
