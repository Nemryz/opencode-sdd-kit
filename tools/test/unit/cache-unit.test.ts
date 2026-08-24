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

describe("speckit-cache unit", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cache-unit-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe("hashFile", () => {
    it("returns hash for existing file", async () => {
      const filePath = path.join(tmpDir, "test.txt")
      await fs.writeFile(filePath, "hello world")
      const hash = await hashFile(filePath)
      expect(hash).toMatch(/^[a-f0-9]{16}$/)
    })

    it("returns different hashes for different content", async () => {
      const file1 = path.join(tmpDir, "a.txt")
      const file2 = path.join(tmpDir, "b.txt")
      await fs.writeFile(file1, "content A")
      await fs.writeFile(file2, "content B")
      const hash1 = await hashFile(file1)
      const hash2 = await hashFile(file2)
      expect(hash1).not.toBe(hash2)
    })

    it("returns same hash for same content", async () => {
      const file1 = path.join(tmpDir, "a.txt")
      const file2 = path.join(tmpDir, "b.txt")
      await fs.writeFile(file1, "same content")
      await fs.writeFile(file2, "same content")
      const hash1 = await hashFile(file1)
      const hash2 = await hashFile(file2)
      expect(hash1).toBe(hash2)
    })

    it("returns missing for non-existent file", async () => {
      const hash = await hashFile(path.join(tmpDir, "nonexistent.txt"))
      expect(hash).toBe("missing")
    })
  })

  describe("getFileHashes", () => {
    it("returns empty hashes for empty project", async () => {
      const hashes = await getFileHashes(tmpDir)
      expect(hashes).toBeDefined()
      expect(typeof hashes).toBe("object")
    })

    it("includes session.json hash when exists", async () => {
      const opencodeDir = path.join(tmpDir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })
      await fs.writeFile(path.join(opencodeDir, "session.json"), "{}")
      const hashes = await getFileHashes(tmpDir)
      const keys = Object.keys(hashes)
      expect(keys.some(k => k.includes("session.json"))).toBe(true)
    })

    it("includes spec.json hashes when specs exist", async () => {
      const specsDir = path.join(tmpDir, "specs", "001-test")
      await fs.mkdir(specsDir, { recursive: true })
      await fs.writeFile(path.join(specsDir, "spec.json"), "{}")
      const hashes = await getFileHashes(tmpDir)
      expect(hashes["specs/001-test/spec.json"]).toMatch(/^[a-f0-9]{16}$/)
    })

    it("returns missing for non-existent files", async () => {
      const hashes = await getFileHashes(tmpDir)
      const keys = Object.keys(hashes)
      expect(keys.some(k => k.includes("session.json"))).toBe(true)
      expect(keys.some(k => k.includes("constitution.md"))).toBe(true)
    })
  })

  describe("generateCacheKey", () => {
    it("generates consistent key for same inputs", () => {
      const key1 = generateCacheKey("speckit-audit", {}, { "session.json": "abc" })
      const key2 = generateCacheKey("speckit-audit", {}, { "session.json": "abc" })
      expect(key1).toBe(key2)
    })

    it("generates different key for different tools", () => {
      const key1 = generateCacheKey("speckit-audit", {}, {})
      const key2 = generateCacheKey("speckit-validate", {}, {})
      expect(key1).not.toBe(key2)
    })

    it("generates different key for different args", () => {
      const key1 = generateCacheKey("speckit-audit", { fix: true }, {})
      const key2 = generateCacheKey("speckit-audit", { fix: false }, {})
      expect(key1).not.toBe(key2)
    })

    it("generates different key for different file hashes", () => {
      const key1 = generateCacheKey("speckit-audit", {}, { "session.json": "abc" })
      const key2 = generateCacheKey("speckit-audit", {}, { "session.json": "def" })
      expect(key1).not.toBe(key2)
    })

    it("returns 16 character hex string", () => {
      const key = generateCacheKey("tool", {}, {})
      expect(key).toMatch(/^[a-f0-9]{16}$/)
    })
  })

  describe("getSlowTools", () => {
    it("returns empty array when no perf.json exists", async () => {
      const slowTools = await getSlowTools(tmpDir)
      expect(slowTools).toEqual([])
    })

    it("returns empty array when no slow tools", async () => {
      const perfDir = path.join(tmpDir, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: new Date().toISOString(),
        stats: [
          { tool: "speckit-audit", calls: 10, avg: 100, p95: 200, p99: 300 },
        ],
      }))
      const slowTools = await getSlowTools(tmpDir)
      expect(slowTools).toEqual([])
    })

    it("returns slow tools with avg > 500", async () => {
      const perfDir = path.join(tmpDir, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: new Date().toISOString(),
        stats: [
          { tool: "speckit-audit", calls: 10, avg: 600, p95: 200, p99: 300 },
        ],
      }))
      const slowTools = await getSlowTools(tmpDir)
      expect(slowTools).toContain("speckit-audit")
    })

    it("returns slow tools with p95 > 1000", async () => {
      const perfDir = path.join(tmpDir, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: new Date().toISOString(),
        stats: [
          { tool: "speckit-validate", calls: 10, avg: 200, p95: 1200, p99: 1500 },
        ],
      }))
      const slowTools = await getSlowTools(tmpDir)
      expect(slowTools).toContain("speckit-validate")
    })

    it("returns multiple slow tools", async () => {
      const perfDir = path.join(tmpDir, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: new Date().toISOString(),
        stats: [
          { tool: "speckit-audit", calls: 10, avg: 600, p95: 200, p99: 300 },
          { tool: "speckit-validate", calls: 10, avg: 200, p95: 1200, p99: 1500 },
          { tool: "speckit-status", calls: 10, avg: 50, p95: 100, p99: 150 },
        ],
      }))
      const slowTools = await getSlowTools(tmpDir)
      expect(slowTools).toContain("speckit-audit")
      expect(slowTools).toContain("speckit-validate")
      expect(slowTools).not.toContain("speckit-status")
    })

    it("returns empty array for invalid perf.json", async () => {
      const perfDir = path.join(tmpDir, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), "not json")
      const slowTools = await getSlowTools(tmpDir)
      expect(slowTools).toEqual([])
    })
  })

  describe("calculateCacheStats", () => {
    it("calculates hit rate correctly", () => {
      const stats = calculateCacheStats(80, 20, 50000)
      expect(stats.hitRate).toBe("80.0")
      expect(stats.totalCalls).toBe(100)
      expect(stats.timeSavedSeconds).toBe("50.0")
    })

    it("handles zero calls", () => {
      const stats = calculateCacheStats(0, 0, 0)
      expect(stats.hitRate).toBe("0.0")
      expect(stats.totalCalls).toBe(0)
      expect(stats.timeSavedSeconds).toBe("0.0")
    })

    it("handles 100% hit rate", () => {
      const stats = calculateCacheStats(50, 0, 25000)
      expect(stats.hitRate).toBe("100.0")
      expect(stats.totalCalls).toBe(50)
    })

    it("handles 0% hit rate", () => {
      const stats = calculateCacheStats(0, 50, 0)
      expect(stats.hitRate).toBe("0.0")
      expect(stats.totalCalls).toBe(50)
    })

    it("rounds time correctly", () => {
      const stats = calculateCacheStats(1, 1, 1500)
      expect(stats.timeSavedSeconds).toBe("1.5")
    })
  })
})
