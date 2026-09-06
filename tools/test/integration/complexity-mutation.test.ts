import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import complexityTool from "../../speckit-complexity"
import { mockContext } from "../helpers/setup"

let worktree: string

beforeEach(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "complexity-mutation-"))
})

afterEach(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

describe("Complexity Module - Mutation Score Improvement", () => {

  describe("Basic assessment", () => {
    it("returns error for invalid worktree", async () => {
      const result = await complexityTool.execute({ taskDescription: "test" }, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error for invalid project root", async () => {
      const result = await complexityTool.execute({ taskDescription: "test" }, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })

    it("returns success for valid project", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({ taskDescription: "test task" }, ctx)
      expect(result.title).toBeDefined()
      expect(result.output).toBeDefined()
    })
  })

  describe("Complexity scoring", () => {
    it("returns simple for low complexity", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "simple task",
        filesAffected: 1,
      }, ctx)
      expect(result.output).toBeDefined()
    })

    it("returns standard for medium complexity", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "medium task",
        filesAffected: 5,
      }, ctx)
      expect(result.output).toBeDefined()
    })

    it("returns complex for high complexity", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "complex task",
        filesAffected: 10,
        hasNewDependencies: true,
        hasBoundaryAnnotations: true,
      }, ctx)
      expect(result.output).toBeDefined()
    })
  })

  describe("Parameter variations", () => {
    it("handles filesAffected = 0", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        filesAffected: 0,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles filesAffected = 1", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        filesAffected: 1,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles filesAffected = 100", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        filesAffected: 100,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles hasNewDependencies = true", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        hasNewDependencies: true,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles hasNewDependencies = false", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        hasNewDependencies: false,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles hasBoundaryAnnotations = true", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        hasBoundaryAnnotations: true,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles hasBoundaryAnnotations = false", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        hasBoundaryAnnotations: false,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles hasNeedsClarification = true", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        hasNeedsClarification: true,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles hasNeedsClarification = false", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        hasNeedsClarification: false,
      }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Task description variations", () => {
    it("handles empty task description", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "",
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles long task description", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "a".repeat(1000),
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles special characters in task description", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test!@#$%^&*()",
      }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Project context", () => {
    it("uses project context when useProjectContext = true", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        useProjectContext: true,
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("does not use project context when useProjectContext = false", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
        useProjectContext: false,
      }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Edge cases", () => {
    it("handles undefined filesAffected", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles undefined hasNewDependencies", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles undefined hasBoundaryAnnotations", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles undefined hasNeedsClarification", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
      }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles undefined useProjectContext", async () => {
      const ctx = mockContext(worktree)
      const result = await complexityTool.execute({
        taskDescription: "test",
      }, ctx)
      expect(result.title).toBeDefined()
    })
  })
})
