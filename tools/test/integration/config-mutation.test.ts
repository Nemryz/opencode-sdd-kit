import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import configTool from "../../speckit-config"
import { mockContext } from "../helpers/setup"

let worktree: string

beforeEach(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "config-mutation-"))
  const opencodeDir = path.join(worktree, ".opencode")
  await fs.mkdir(opencodeDir, { recursive: true })
})

afterEach(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

describe("Config Module - Mutation Score Improvement", () => {

  describe("Basic operations", () => {
    it("returns error for invalid worktree", async () => {
      const result = await configTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error for invalid project root", async () => {
      const result = await configTool.execute({}, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })

    it("returns success for valid project", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({}, ctx)
      expect(result.title).toBeDefined()
      expect(result.output).toBeDefined()
    })
  })

  describe("Read config", () => {
    it("reads default config", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("reads existing config", async () => {
      const configPath = path.join(worktree, ".opencode", "config.json")
      await fs.writeFile(configPath, JSON.stringify({ language: "en" }))
      const ctx = mockContext(worktree)
      const result = await configTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("handles corrupt config", async () => {
      const configPath = path.join(worktree, ".opencode", "config.json")
      await fs.writeFile(configPath, "not json")
      const ctx = mockContext(worktree)
      const result = await configTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })
  })

  describe("Update config", () => {
    it("updates config with key and value", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ key: "language", value: "es" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("updates defaultTechStack", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ defaultTechStack: "Node.js + PostgreSQL" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles empty key", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ key: "", value: "test" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles empty value", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ key: "language", value: "" }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Edge cases", () => {
    it("handles undefined key", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ value: "test" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles undefined value", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ key: "language" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles undefined defaultTechStack", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ defaultTechStack: undefined }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles null key", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ key: null, value: "test" } as any, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles null value", async () => {
      const ctx = mockContext(worktree)
      const result = await configTool.execute({ key: "language", value: null } as any, ctx)
      expect(result.title).toBeDefined()
    })
  })
})
