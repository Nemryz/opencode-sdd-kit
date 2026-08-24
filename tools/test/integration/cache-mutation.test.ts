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
} from "../../plugins/speckit-cache"
import cacheTool from "../../speckit-cache"

describe("speckit-cache mutation", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cache-mutation-"))
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

  describe("hashFile mutations", () => {
    it("returns 16 char hash", async () => {
      const file = path.join(tmpDir, "test.txt")
      await fs.writeFile(file, "test content")
      const hash = await hashFile(file)
      expect(hash).toHaveLength(16)
    })

    it("hash is hex string", async () => {
      const file = path.join(tmpDir, "test.txt")
      await fs.writeFile(file, "test content")
      const hash = await hashFile(file)
      expect(hash).toMatch(/^[a-f0-9]+$/)
    })

    it("different files produce different hashes", async () => {
      const file1 = path.join(tmpDir, "a.txt")
      const file2 = path.join(tmpDir, "b.txt")
      await fs.writeFile(file1, "content A")
      await fs.writeFile(file2, "content B")
      const h1 = await hashFile(file1)
      const h2 = await hashFile(file2)
      expect(h1).not.toBe(h2)
    })
  })

  describe("getFileHashes mutations", () => {
    it("returns object", async () => {
      const hashes = await getFileHashes(tmpDir)
      expect(typeof hashes).toBe("object")
    })

    it("includes session.json key", async () => {
      const hashes = await getFileHashes(tmpDir)
      const keys = Object.keys(hashes)
      expect(keys.some(k => k.includes("session.json"))).toBe(true)
    })
  })

  describe("generateCacheKey mutations", () => {
    it("returns string", () => {
      const key = generateCacheKey("tool", {}, {})
      expect(typeof key).toBe("string")
    })

    it("key length is 16", () => {
      const key = generateCacheKey("tool", {}, {})
      expect(key).toHaveLength(16)
    })

    it("different tool names produce different keys", () => {
      const k1 = generateCacheKey("a", {}, {})
      const k2 = generateCacheKey("b", {}, {})
      expect(k1).not.toBe(k2)
    })
  })

  describe("getSlowTools mutations", () => {
    it("returns array", async () => {
      const tools = await getSlowTools(tmpDir)
      expect(Array.isArray(tools)).toBe(true)
    })

    it("empty array when no perf.json", async () => {
      const tools = await getSlowTools(tmpDir)
      expect(tools.length).toBe(0)
    })
  })

  describe("calculateCacheStats mutations", () => {
    it("returns object with required fields", () => {
      const stats = calculateCacheStats(10, 5, 1000)
      expect(stats).toHaveProperty("hitRate")
      expect(stats).toHaveProperty("totalCalls")
      expect(stats).toHaveProperty("timeSavedSeconds")
    })

    it("hitRate is string", () => {
      const stats = calculateCacheStats(10, 5, 1000)
      expect(typeof stats.hitRate).toBe("string")
    })

    it("totalCalls is number", () => {
      const stats = calculateCacheStats(10, 5, 1000)
      expect(typeof stats.totalCalls).toBe("number")
    })
  })

  describe("cache tool mutations", () => {
    it("status returns title", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBeDefined()
    })

    it("status returns output string", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(typeof result.output).toBe("string")
    })

    it("clear returns requiresConfirmation", async () => {
      const result = await runTool({ subcommand: "clear" })
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("onConfirm returns title", async () => {
      const result = await runTool({ subcommand: "clear" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.title).toBeDefined()
    })

    it("unknown subcommand returns error", async () => {
      const result = await runTool({ subcommand: "xyz" })
      expect(result.title).toBe("Error")
    })
  })

  describe("cache plugin hooks", () => {
    it("plugin has before hook", async () => {
      const mod = await import("../../plugins/speckit-cache")
      const plugin = mod.default
      expect(plugin.id).toBe("speckit-cache")
      expect(plugin.server).toBeDefined()
    })

    it("plugin server is function", async () => {
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      expect(typeof server).toBe("object")
    })

    it("before hook is function", async () => {
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      expect(typeof server["tool.execute.before"]).toBe("function")
    })

    it("after hook is function", async () => {
      const mod = await import("../../plugins/speckit-cache")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      expect(typeof server["tool.execute.after"]).toBe("function")
    })
  })
})
