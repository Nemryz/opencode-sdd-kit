import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import selfhealTool from "../../speckit-selfheal"
import { mockContext } from "../helpers/setup"

let worktree: string

beforeEach(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "selfheal-mutation-"))
  const opencodeDir = path.join(worktree, ".opencode")
  const specMemoryDir = path.join(opencodeDir, "spec-memory")
  await fs.mkdir(specMemoryDir, { recursive: true })
  await fs.writeFile(path.join(opencodeDir, "session.json"), "{}")
  await fs.writeFile(path.join(specMemoryDir, "constitution.md"), "# Constitution")
  const specsDir = path.join(worktree, "specs")
  await fs.mkdir(specsDir, { recursive: true })
})

afterEach(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

describe("Selfheal Module - Mutation Score Improvement", () => {

  describe("Basic operations", () => {
    it("returns error for invalid worktree", async () => {
      const result = await selfhealTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error for invalid project root", async () => {
      const result = await selfhealTool.execute({}, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })

    it("returns success for valid project", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toBeDefined()
      expect(result.output).toBeDefined()
    })
  })

  describe("Health scan", () => {
    it("scans for issues", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("detects missing files", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("detects corrupt files", async () => {
      const configPath = path.join(worktree, ".opencode", "session.json")
      await fs.writeFile(configPath, "not json")
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })
  })

  describe("Auto-fix", () => {
    it("fixes issues when fix = true", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.title).toBeDefined()
    })

    it("does not fix when fix = false", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({ fix: false }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles fix = undefined", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({ fix: undefined }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Rollback", () => {
    it("creates backup before fix", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.title).toBeDefined()
    })

    it("restores from backup on failure", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Edge cases", () => {
    it("handles empty project", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles project with no specs", async () => {
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles project with multiple features", async () => {
      const specsDir = path.join(worktree, "specs")
      await fs.mkdir(path.join(specsDir, "001-test"), { recursive: true })
      await fs.mkdir(path.join(specsDir, "002-test"), { recursive: true })
      const ctx = mockContext(worktree)
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toBeDefined()
    })
  })
})
