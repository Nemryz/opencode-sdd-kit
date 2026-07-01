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

  it("detects migration keyword and adds 2 points", async () => {
    const r = await assessComplexity("migrate database from X to Y", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(2)
    expect(r.reasoning.some(line => line.includes("migration"))).toBe(true)
  })

  it("detects refactor keyword and adds 1 point", async () => {
    const r = await assessComplexity("refactor user service", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(1)
    expect(r.reasoning.some(line => line.includes("refactoring"))).toBe(true)
  })

  it("detects auth keyword adds 1 point", async () => {
    const r = await assessComplexity("add authentication system", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(1)
    expect(r.reasoning.some(line => line.includes("security"))).toBe(true)
  })

  it("detects performance keyword adds 1 point", async () => {
    const r = await assessComplexity("optimize page load performance", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(1)
    expect(r.reasoning.some(line => line.includes("performance"))).toBe(true)
  })

  it("detects database keyword adds 1 point", async () => {
    const r = await assessComplexity("update database schema", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(1)
    expect(r.reasoning.some(line => line.includes("database"))).toBe(true)
  })

  it("detects api keyword adds 1 point", async () => {
    const r = await assessComplexity("create API endpoint for users", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(1)
    expect(r.reasoning.some(line => line.includes("API"))).toBe(true)
  })

  it("detects concurrency keyword adds 1 point", async () => {
    const r = await assessComplexity("fix race condition in worker", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(1)
    expect(r.reasoning.some(line => line.includes("concurrency"))).toBe(true)
  })

  it("detects cache keyword adds 1 point", async () => {
    const r = await assessComplexity("implement cache layer for queries", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(1)
    expect(r.reasoning.some(line => line.includes("infrastructure"))).toBe(true)
  })

  it("detects multiple distinct keywords without duplication", async () => {
    const r = await assessComplexity("refactor and migrate the entire API", 1, false, false, false)
    expect(r.score).toBeGreaterThanOrEqual(3)
    const migrations = r.reasoning.filter(line => line.includes("migration")).length
    expect(migrations).toBe(1)
  })

  it("does not add keyword score for simple unrelated description", async () => {
    const r1 = await assessComplexity("update readme documentation", 1, false, false, false)
    const r2 = await assessComplexity("fix typo in comment", 1, false, false, false)
    const keywordScores = [r1.score, r2.score]
    expect(keywordScores.every(s => s <= 0)).toBe(true)
  })

  it("does not duplicate reason when same keyword appears twice", async () => {
    const r = await assessComplexity("migrate database and migrate schema", 1, false, false, false)
    const migrationExact = r.reasoning.filter(line => line === "migration task detected: high risk of breaking changes").length
    expect(migrationExact).toBe(1)
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
