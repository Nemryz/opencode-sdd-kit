import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import cleanTool from "../../speckit-clean"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { readSpecJson, writeSpecJson, readSession, writeSession, specsDirPath } from "../../shared/types"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

describe("clean with no features", () => {
  it("returns No features when specs/ does not exist", async () => {
    const result = await cleanTool.execute({}, ctx)
    expect(result.title).toBe("No features")
  })

  it("returns zero features for empty specs/ directory", async () => {
    const specsDir = specsDirPath(worktree)
    await fs.mkdir(specsDir, { recursive: true })
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.total).toBe(0)
  })

  it("filters out non-NNN directories", async () => {
    const specsDir = specsDirPath(worktree)
    await fs.mkdir(path.join(specsDir, "random-dir"), { recursive: true })
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.total).toBe(0)
    expect(result.metadata?.issues).toHaveLength(0)
  })
})

describe("clean feature status detection", () => {
  it("reports ok for complete feature (spec.json phase mismatch is separate)", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.ok).toBe(1)
    expect(result.metadata?.issues.some((i: string) => i.includes("spec.json"))).toBe(true)
  })

  it("reports incomplete for spec-only feature", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.incomplete).toBe(1)
    expect(result.metadata?.issues.length).toBeGreaterThanOrEqual(1)
    expect(result.metadata?.issues[0]).toContain("missing")
  })

  it("reports incomplete for spec + plan only", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.incomplete).toBe(1)
  })

  it("reports orphan for empty directory", async () => {
    const specsDir = specsDirPath(worktree)
    await fs.mkdir(path.join(specsDir, "001-empty"), { recursive: true })
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.orphan).toBe(1)
    expect(result.metadata?.issues[0]).toContain("empty")
  })
})

describe("clean spec.json mismatch detection", () => {
  it("detects phase mismatch between spec.json and files", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const base = path.join(worktree, "specs", "001-auth")
    const sj = await readSpecJson(base)
    if (sj) {
      sj.phase = "ready"
      await writeSpecJson(sj, base)
    }
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.issues.some((i: string) => i.includes("spec.json"))).toBe(true)
  })

  it("detects ready_for_implementation mismatch", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const base = path.join(worktree, "specs", "001-auth")
    const sj = await readSpecJson(base)
    if (sj) {
      sj.ready_for_implementation = true
      await writeSpecJson(sj, base)
    }
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.issues.some((i: string) => i.includes("ready_for_implementation"))).toBe(true)
  })

  it("reports no spec.json issues when spec.json phase matches reality", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    const base = path.join(worktree, "specs", "001-auth")
    const sj = await readSpecJson(base)
    if (sj) {
      sj.phase = "ready"
      await writeSpecJson(sj, base)
    }
    const result = await cleanTool.execute({}, ctx)
    const issues: string[] = result.metadata?.issues ?? []
    const specJsonIssues = issues.filter((i: string) => i.includes("spec.json"))
    expect(specJsonIssues).toHaveLength(0)
  })
})

describe("clean multiple features", () => {
  it("reports correct counts for mixed features", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    await scaffoldTool.execute({ featureName: "Billing", template: "spec" }, ctx)
    const specsDir = specsDirPath(worktree)
    await fs.mkdir(path.join(specsDir, "003-orphan"), { recursive: true })
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.ok).toBe(1)
    expect(result.metadata?.incomplete).toBe(1)
    expect(result.metadata?.orphan).toBe(1)
    expect(result.metadata?.total).toBe(3)
  })
})

describe("clean auto-fix", () => {
  it("fixes spec.json phase mismatch when fix=true", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const base = path.join(worktree, "specs", "001-auth")
    const sj = await readSpecJson(base)
    if (sj) {
      sj.phase = "ready"
      await writeSpecJson(sj, base)
    }
    const result1 = await cleanTool.execute({}, ctx)
    expect(result1.metadata?.issues.some((i: string) => i.includes("spec.json"))).toBe(true)
    const result2 = await cleanTool.execute({ fix: true }, ctx)
    const fixedSj = await readSpecJson(base)
    expect(fixedSj?.phase).not.toBe("ready")
    expect(result2.title).toContain("issues")
  })

  it("updates session state during fix", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    await cleanTool.execute({ fix: true }, ctx)
    const session = await readSession(worktree)
    expect(session.featureDir).toBe("001-auth")
  })

  it("repairs featureDir in session when previous dir removed", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    let session = await readSession(worktree)
    session.featureDir = "001-auth"
    session.featureNumber = 1
    await writeSession(worktree, session)
    const specsDir = specsDirPath(worktree)
    await fs.rm(path.join(specsDir, "001-auth"), { recursive: true, force: true })
    const result = await cleanTool.execute({ fix: true }, ctx)
    const session2 = await readSession(worktree)
    expect(session2.featureDir).toBeNull()
  })
})
