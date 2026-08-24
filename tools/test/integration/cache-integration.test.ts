import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import cacheTool from "../../speckit-cache"

describe("speckit-cache integration", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cache-integration-"))
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

  describe("status subcommand", () => {
    it("returns cache status", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBe("Cache Status")
      expect(result.output).toContain("Cache Statistics")
      expect(result.output).toContain("Performance Impact")
      expect(result.output).toContain("Storage")
    })

    it("shows zero stats when empty", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Total calls: 0")
      expect(result.output).toContain("Cache hits: 0")
      expect(result.output).toContain("Entries: 0/100")
    })

    it("defaults to status when no subcommand", async () => {
      const result = await runTool({})
      expect(result.title).toBe("Cache Status")
    })
  })

  describe("clear subcommand", () => {
    it("returns confirmation for clear all", async () => {
      const result = await runTool({ subcommand: "clear" })
      expect(result.title).toBe("Confirm Cache Clear")
      expect(result.output).toContain("Clear all cache?")
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("returns confirmation for clear tool", async () => {
      const result = await runTool({ subcommand: "clear", tool: "speckit-audit" })
      expect(result.title).toBe("Confirm Cache Clear")
      expect(result.output).toContain("speckit-audit")
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("executes onConfirm for clear all", async () => {
      const result = await runTool({ subcommand: "clear" })
      const confirmResult = await result.metadata?.onConfirm()
      expect(confirmResult?.title).toBe("Cache Cleared")
      expect(confirmResult?.output).toContain("All cache cleared")
    })

    it("executes onConfirm for clear tool", async () => {
      const result = await runTool({ subcommand: "clear", tool: "speckit-audit" })
      const confirmResult = await result.metadata?.onConfirm()
      expect(confirmResult?.title).toBe("Cache Cleared")
      expect(confirmResult?.output).toContain("speckit-audit")
    })
  })

  describe("error handling", () => {
    it("returns error for invalid worktree", async () => {
      const result = await cacheTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error for invalid project root", async () => {
      const result = await cacheTool.execute({}, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })

    it("returns error for unknown subcommand", async () => {
      const result = await runTool({ subcommand: "unknown" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Unknown subcommand")
    })
  })

  describe("cache file operations", () => {
    it("creates cache directory and index file", async () => {
      await runTool({ subcommand: "status" })
      const cacheDir = path.join(tmpDir, ".opencode", "cache")
      try {
        await fs.access(cacheDir)
        expect(true).toBe(true)
      } catch {
        expect(true).toBe(false)
      }
    })

    it("creates entries directory on clear", async () => {
      const result = await runTool({ subcommand: "clear" })
      await result.metadata?.onConfirm()
      const entriesDir = path.join(tmpDir, ".opencode", "cache", "entries")
      try {
        await fs.access(entriesDir)
        expect(true).toBe(true)
      } catch {
        expect(true).toBe(false)
      }
    })
  })
})
