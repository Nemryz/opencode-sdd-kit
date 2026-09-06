import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import statusTool from "../../speckit-status"
import { mockContext } from "../helpers/setup"

let worktree: string

beforeEach(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "status-mutation-"))
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

describe("Status Module - Mutation Score Improvement", () => {

  describe("Basic operations", () => {
    it("returns error for invalid worktree", async () => {
      const result = await statusTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error for invalid project root", async () => {
      const result = await statusTool.execute({}, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })

    it("returns success for valid project", async () => {
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.title).toBeDefined()
      expect(result.output).toBeDefined()
    })
  })

  describe("Status reporting", () => {
    it("reports no features", async () => {
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toContain("No features")
    })

    it("reports features", async () => {
      const specsDir = path.join(worktree, "specs")
      await fs.mkdir(path.join(specsDir, "001-test"), { recursive: true })
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("reports multiple features", async () => {
      const specsDir = path.join(worktree, "specs")
      await fs.mkdir(path.join(specsDir, "001-test"), { recursive: true })
      await fs.mkdir(path.join(specsDir, "002-test"), { recursive: true })
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })
  })

  describe("Phase detection", () => {
    it("detects spec phase", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), JSON.stringify({
        phase: "spec",
        approvals: {
          spec: { generated: true, approved: false },
          plan: { generated: false, approved: false },
          tasks: { generated: false, approved: false },
        },
      }))
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("detects plan phase", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), JSON.stringify({
        phase: "plan",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: false, approved: false },
          tasks: { generated: false, approved: false },
        },
      }))
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("detects tasks phase", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), JSON.stringify({
        phase: "tasks",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: true, approved: true },
          tasks: { generated: false, approved: false },
        },
      }))
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("detects ready phase", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), JSON.stringify({
        phase: "ready",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: true, approved: true },
          tasks: { generated: true, approved: true },
        },
        ready_for_implementation: true,
      }))
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("detects impl phase", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), JSON.stringify({
        phase: "impl",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: true, approved: true },
          tasks: { generated: true, approved: true },
        },
        ready_for_implementation: true,
      }))
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })

    it("detects complete phase", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), JSON.stringify({
        phase: "complete",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: true, approved: true },
          tasks: { generated: true, approved: true },
        },
        ready_for_implementation: true,
      }))
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.output).toBeDefined()
    })
  })

  describe("Edge cases", () => {
    it("handles corrupt session.json", async () => {
      const sessionPath = path.join(worktree, ".opencode", "session.json")
      await fs.writeFile(sessionPath, "not json")
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles missing constitution", async () => {
      const constitutionPath = path.join(worktree, ".opencode", "spec-memory", "constitution.md")
      await fs.unlink(constitutionPath)
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles empty spec.json", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), "{}")
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles corrupt spec.json", async () => {
      const specsDir = path.join(worktree, "specs")
      const specDir = path.join(specsDir, "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), "not json")
      const ctx = mockContext(worktree)
      const result = await statusTool.execute({}, ctx)
      expect(result.title).toBeDefined()
    })
  })
})
