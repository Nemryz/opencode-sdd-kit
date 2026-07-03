import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import scaffoldTool from "../../speckit-scaffold"
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

describe("scaffold fallback content (no template files)", () => {
  it("creates spec.md with fallback content when template is missing", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Fallback Spec", template: "spec" },
      ctx,
    )
    expect(result.metadata?.featureDir).toBe("001-fallback-spec")
    const filePath = path.join(worktree, "specs", "001-fallback-spec", "spec.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("Fallback Spec")
    expect(content).toContain("P1 - MVP")
    expect(content).toContain("Gherkin")
  })

  it("creates plan.md with fallback content when template is missing", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Fallback Plan", template: "plan" },
      ctx,
    )
    expect(result.metadata?.featureDir).toBe("001-fallback-plan")
    const filePath = path.join(worktree, "specs", "001-fallback-plan", "plan.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("Fallback Plan")
    expect(content).toContain("Key Decisions")
  })

  it("creates tasks.md with fallback content when template is missing", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Fallback Tasks", template: "tasks" },
      ctx,
    )
    expect(result.metadata?.featureDir).toBe("001-fallback-tasks")
    const filePath = path.join(worktree, "specs", "001-fallback-tasks", "tasks.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("Fallback Tasks")
    expect(content).toContain("T-001")
    expect(content).toContain("Setup")
  })

  it("creates steering docs with fallback content", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "TestKit", template: "steering" },
      ctx,
    )
    expect(result.metadata?.created).toHaveLength(3)
    const steeringDir = path.join(worktree, ".opencode", "steering")
    const productContent = await fs.readFile(path.join(steeringDir, "product.md"), "utf-8")
    expect(productContent).toContain("TestKit")
  })

  it("creates constitution with fallback content", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "MyProj", template: "constitution" },
      ctx,
    )
    expect(result.title).toBe("Constitution created")
    const filePath = path.join(worktree, ".opencode", "spec-memory", "constitution.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("MyProj")
    expect(content).toContain("Constitution")
  })

  it("creates domain-map.md (uses template if available)", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "MyApp", template: "domain-map" },
      ctx,
    )
    expect(result.title).toContain("created")
    const filePath = path.join(worktree, ".opencode", "domain-map.md")
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it("creates data-model.md inside existing feature dir with fallback", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "data-model" },
      ctx,
    )
    expect(result.title).toBe("data-model.md created")
    const filePath = path.join(worktree, "specs", "001-auth", "data-model.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("Auth")
    expect(content).toContain("Data Model")
  })

  it("creates research.md inside existing feature dir with fallback", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "research" },
      ctx,
    )
    expect(result.title).toBe("research.md created")
    const filePath = path.join(worktree, "specs", "001-auth", "research.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("Auth")
  })

  it("returns correct next hint for spec", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Test", template: "spec" },
      ctx,
    )
    expect(result.metadata?.nextCommand).toContain("/plan")
  })

  it("returns correct next hint for plan", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Test", template: "plan" },
      ctx,
    )
    expect(result.metadata?.nextCommand).toContain("/tasks")
  })

  it("returns correct next hint for tasks", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Test", template: "tasks" },
      ctx,
    )
    expect(result.metadata?.nextCommand).toContain("/impl")
  })

  it("maintains lifecycle spec -> plan -> tasks with fallback content", async () => {
    const r1 = await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    expect(r1.metadata?.featureDir).toBe("001-auth")

    const r2 = await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    expect(r2.metadata?.featureDir).toBe("001-auth")

    const r3 = await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    expect(r3.metadata?.featureDir).toBe("001-auth")

    const specPath = path.join(worktree, "specs", "001-auth", "spec.md")
    const planPath = path.join(worktree, "specs", "001-auth", "plan.md")
    const tasksPath = path.join(worktree, "specs", "001-auth", "tasks.md")
    expect(await fs.access(specPath).then(() => true).catch(() => false)).toBe(true)
    expect(await fs.access(planPath).then(() => true).catch(() => false)).toBe(true)
    expect(await fs.access(tasksPath).then(() => true).catch(() => false)).toBe(true)

    const specContent = await fs.readFile(specPath, "utf-8")
    const planContent = await fs.readFile(planPath, "utf-8")
    const tasksContent = await fs.readFile(tasksPath, "utf-8")
    expect(specContent).toContain("Auth")
    expect(planContent).toContain("Auth")
    expect(tasksContent).toContain("Auth")
  })

  it("increments feature numbers correctly with fallback", async () => {
    await scaffoldTool.execute({ featureName: "F1", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "F2", template: "spec" }, ctx)
    const dirs = await fs.readdir(path.join(worktree, "specs"))
    expect(dirs).toContain("001-f1")
    expect(dirs).toContain("002-f2")
  })
})
