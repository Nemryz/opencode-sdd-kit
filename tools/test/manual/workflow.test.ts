import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import scaffoldTool from "../../speckit-scaffold"
import validateTool from "../../speckit-validate"
import auditTool from "../../speckit-audit"
import cleanTool from "../../speckit-clean"
import statusTool from "../../speckit-status"
import configTool from "../../speckit-config"
import { mockContext, createConstitution } from "../helpers/setup"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeAll(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "sdd-manual-"))
  ctx = mockContext(worktree)
})

afterAll(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

describe("manual SDD workflow", () => {
  it("step 1: validate empty project returns empty phase", async () => {
    const result = await validateTool.execute({}, ctx)
    expect(result.metadata?.phase).toBe("empty")
  })

  it("step 2: validate shows empty after constitution created", async () => {
    await createConstitution(worktree)
    const result = await validateTool.execute({}, ctx)
    expect(result.metadata?.phase).toBe("empty")
  })

  it("step 3: scaffold spec creates 001-auth directory", async () => {
    const result = await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    expect(result.output).toContain("001-auth")
    const dirExists = await fs.stat(path.join(worktree, "specs", "001-auth")).then(() => true).catch(() => false)
    expect(dirExists).toBe(true)
  })

  it("step 4: validate shows spec phase after spec created", async () => {
    const result = await validateTool.execute({ featureDir: "001-auth" }, ctx)
    expect(result.metadata?.phase).toBe("spec")
    expect(result.metadata?.artifacts?.spec).toBe(true)
  })

  it("step 5: scaffold plan succeeds", async () => {
    const result = await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    expect(result.output).toContain("001-auth")
    const planExists = await fs.stat(path.join(worktree, "specs", "001-auth", "plan.md")).then(() => true).catch(() => false)
    expect(planExists).toBe(true)
  })

  it("step 6: validate shows plan phase", async () => {
    const result = await validateTool.execute({ featureDir: "001-auth" }, ctx)
    expect(result.metadata?.phase).toBe("plan")
  })

  it("step 7: scaffold tasks succeeds", async () => {
    const result = await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    expect(result.output).toContain("001-auth")
    const tasksExists = await fs.stat(path.join(worktree, "specs", "001-auth", "tasks.md")).then(() => true).catch(() => false)
    expect(tasksExists).toBe(true)
  })

  it("step 8: validate shows tasks phase", async () => {
    const result = await validateTool.execute({ featureDir: "001-auth" }, ctx)
    expect(result.metadata?.phase).toBe("tasks")
  })

  it("step 9: status shows 1 feature", async () => {
    const result = await statusTool.execute({}, ctx)
    expect(result.metadata?.featureCount).toBe(1)
    expect(result.output).toContain("001-auth")
  })

  it("step 10: audit runs without errors", async () => {
    const result = await auditTool.execute({}, ctx)
    expect(result.metadata?.errorCount).toBe(0)
  })

  it("step 11: clean reports 1 feature", async () => {
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.total).toBe(1)
  })

  it("step 12: config read and write", async () => {
    const readResult = await configTool.execute({}, ctx)
    expect(readResult.title).toBe("SDD Configuration")
    const writeResult = await configTool.execute({ defaultTechStack: "Node.js+PostgreSQL" }, ctx)
    expect(writeResult.output).toContain("Node.js+PostgreSQL")
  })

  it("step 13: scaffold second feature", async () => {
    const result = await scaffoldTool.execute({ featureName: "Billing", template: "spec" }, ctx)
    expect(result.output).toContain("002-billing")
    const statusResult = await statusTool.execute({}, ctx)
    expect(statusResult.metadata?.featureCount).toBe(2)
  })
})
