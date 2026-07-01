import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import complexityTool from "../../speckit-complexity"
import { assessComplexity } from "../../shared/types"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

// ── assessComplexity unit tests ──────────────────────────

describe("assessComplexity", () => {
  it("returns simple for single file with no deps or boundaries", async () => {
    const r = await assessComplexity("fix typo in readme", 1, false, false, false)
    expect(r.level).toBe("simple")
    expect(r.score).toBeLessThanOrEqual(2)
  })

  it("returns standard for 5 files with no deps", async () => {
    const r = await assessComplexity("add form validation", 5, false, false, false)
    expect(r.level).toBe("standard")
    expect(r.score).toBeGreaterThanOrEqual(3)
    expect(r.score).toBeLessThanOrEqual(6)
  })

  it("returns complex for 10 files with new deps and boundaries", async () => {
    const r = await assessComplexity("implement payment gateway", 10, true, true, false)
    expect(r.level).toBe("complex")
    expect(r.score).toBeGreaterThanOrEqual(7)
  })

  it("returns complex for task with needs clarification", async () => {
    const r = await assessComplexity("implement auth", 5, false, false, true)
    expect(r.level).toBe("standard")
    expect(r.score).toBeGreaterThanOrEqual(3)
  })

  it("returns complex when files + deps + boundaries + clarification all present", async () => {
    const r = await assessComplexity("big feature rewrite", 12, true, true, true)
    expect(r.level).toBe("complex")
    expect(r.score).toBeGreaterThanOrEqual(10)
  })

  it("returns reasoning array with expected length", async () => {
    const r = await assessComplexity("simple task", 1, false, false, false)
    expect(r.reasoning.length).toBeGreaterThanOrEqual(5)
    expect(r.reasoning.some(line => line.includes("score"))).toBe(true)
  })
})

// ── complexityTool integration tests ─────────────────────

describe("complexity tool", () => {
  it("returns simple for basic task", async () => {
    const result = await complexityTool.execute({
      taskDescription: "fix typo in readme",
      filesAffected: 1,
    }, ctx)
    expect(result.metadata?.level).toBe("simple")
    expect(result.title).toContain("simple")
  })

  it("returns standard for moderate task", async () => {
    const result = await complexityTool.execute({
      taskDescription: "add form validation",
      filesAffected: 5,
    }, ctx)
    expect(result.metadata?.level).toBe("standard")
  })

  it("returns complex for large task with dependencies", async () => {
    const result = await complexityTool.execute({
      taskDescription: "implement payment gateway",
      filesAffected: 10,
      hasNewDependencies: true,
      hasBoundaryAnnotations: true,
    }, ctx)
    expect(result.metadata?.level).toBe("complex")
    expect(result.metadata?.score).toBeGreaterThanOrEqual(10)
  })

  it("returns error when no worktree", async () => {
    const result = await complexityTool.execute({
      taskDescription: "test",
    }, { worktree: "" })
    expect(result.title).toBe("Error")
    expect(result.output).toContain("worktree")
  })

  it("includes reasoning in metadata", async () => {
    const result = await complexityTool.execute({
      taskDescription: "test",
      filesAffected: 3,
    }, ctx)
    expect(result.metadata?.reasoning).toBeDefined()
    expect(Array.isArray(result.metadata?.reasoning)).toBe(true)
  })

  it("accepts useProjectContext flag", async () => {
    const result = await complexityTool.execute({
      taskDescription: "test",
      filesAffected: 2,
      useProjectContext: true,
    }, ctx)
    expect(result.metadata?.level).toBeDefined()
    expect(result.metadata?.reasoning).toBeDefined()
  })

  it("defaults optional fields when omitted", async () => {
    const result = await complexityTool.execute({
      taskDescription: "simple task",
    }, ctx)
    expect(result.metadata?.level).toBe("simple")
    expect(result.metadata?.filesAffected).toBe(1)
    expect(result.metadata?.hasNewDependencies).toBe(false)
  })

  it("returns complex when all risk factors enabled", async () => {
    const result = await complexityTool.execute({
      taskDescription: "complex feature",
      filesAffected: 8,
      hasNewDependencies: true,
      hasBoundaryAnnotations: true,
      hasNeedsClarification: true,
    }, ctx)
    expect(result.metadata?.level).toBe("complex")
    expect(result.title).toContain("complex")
  })
})
