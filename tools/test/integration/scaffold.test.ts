import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"
import { readSpecJson } from "../../shared/types"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

// ── Constitution ─────────────────────────────────────────────

describe("scaffold constitution", () => {
  it("creates constitution.md in .opencode/spec-memory/", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "My Project", template: "constitution" },
      ctx,
    )
    expect(result.title).toBe("Constitution created")
    const filePath = path.join(worktree, ".opencode", "spec-memory", "constitution.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("My Project")
  })

  it("loads template content from relative path (not fallback)", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "TestProj", template: "constitution" },
      ctx,
    )
    expect(result.title).toBe("Constitution created")
    const filePath = path.join(worktree, ".opencode", "spec-memory", "constitution.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("Article I")
    expect(content).toContain("Article II")
    expect(content).toContain("TestProj")
  })

  it("returns exists=true when constitution already exists without overwrite", async () => {
    await scaffoldTool.execute({ featureName: "P1", template: "constitution" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "P2", template: "constitution" },
      ctx,
    )
    expect(result.metadata?.exists).toBe(true)
  })

  it("overwrites when overwrite=true", async () => {
    await scaffoldTool.execute({ featureName: "Original", template: "constitution" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Overwritten", template: "constitution", overwrite: true },
      ctx,
    )
    expect(result.title).toBe("Constitution created")
    const filePath = path.join(worktree, ".opencode", "spec-memory", "constitution.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("Overwritten")
  })
})

// ── Steering ─────────────────────────────────────────────────

describe("scaffold steering", () => {
  it("creates product.md, tech.md, structure.md in .opencode/steering/", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "MyKit", template: "steering" },
      ctx,
    )
    expect(result.metadata?.created).toHaveLength(3)
    const steeringDir = path.join(worktree, ".opencode", "steering")
    const files = await fs.readdir(steeringDir)
    expect(files).toContain("product.md")
    expect(files).toContain("tech.md")
    expect(files).toContain("structure.md")
  })

  it("skips existing files without overwrite", async () => {
    await scaffoldTool.execute({ featureName: "V1", template: "steering" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "V2", template: "steering" },
      ctx,
    )
    expect(result.metadata?.created).toHaveLength(0)
    expect(result.metadata?.skipped).toHaveLength(3)
  })
})

// ── Domain Map / Glossary ────────────────────────────────────

describe("scaffold domain-map and glossary", () => {
  it("creates domain-map.md in .opencode/", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "MyApp", template: "domain-map" },
      ctx,
    )
    expect(result.title).toContain("created")
    const filePath = path.join(worktree, ".opencode", "domain-map.md")
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it("creates glossary.md in .opencode/", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "MyApp", template: "glossary" },
      ctx,
    )
    expect(result.title).toContain("created")
    const filePath = path.join(worktree, ".opencode", "glossary.md")
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it("returns exists=true when already present without overwrite", async () => {
    await scaffoldTool.execute({ featureName: "X", template: "domain-map" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Y", template: "domain-map" },
      ctx,
    )
    expect(result.metadata?.exists).toBe(true)
  })
})

// ── Core scaffolds (spec, plan, tasks) ───────────────────────

describe("scaffold spec", () => {
  it("creates specs/001-name/spec.md", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "User Auth", template: "spec" },
      ctx,
    )
    expect(result.metadata?.featureDir).toBe("001-user-auth")
    const filePath = path.join(worktree, "specs", "001-user-auth", "spec.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("User Auth")
  })

  it("sets spec.json phase to spec and spec.generated=true", async () => {
    await scaffoldTool.execute({ featureName: "Login", template: "spec" }, ctx)
    const sj = await readSpecJson(path.join(worktree, "specs", "001-login"))
    expect(sj?.phase).toBe("spec")
    expect(sj?.approvals.spec.generated).toBe(true)
    expect(sj?.approvals.spec.approved).toBe(false)
    expect(sj?.ready_for_implementation).toBe(false)
  })

  it("returns nextCommand /plan", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    expect(result.metadata?.nextCommand).toContain("/plan")
  })
})

describe("scaffold plan", () => {
  it("creates a new feature directory with plan.md", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "plan", techStack: "Node.js" },
      ctx,
    )
    expect(result.metadata?.phase).toBe("plan")
    expect(result.metadata?.featureDir).toBe("001-auth")
    const filePath = path.join(worktree, "specs", "001-auth", "plan.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("plan: Auth")
    expect(content).toContain("Content pending skill generation")
  })

  it("sets spec.json phase to plan with approvals", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    const sj = await readSpecJson(path.join(worktree, "specs", "001-auth"))
    expect(sj?.phase).toBe("plan")
    expect(sj?.approvals.spec.approved).toBe(true)
    expect(sj?.approvals.plan.generated).toBe(true)
  })

  it("returns nextCommand /tasks", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "plan" },
      ctx,
    )
    expect(result.metadata?.nextCommand).toContain("/tasks")
  })
})

describe("scaffold tasks", () => {
  it("creates a new feature directory with tasks.md", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "tasks" },
      ctx,
    )
    expect(result.metadata?.featureDir).toBe("001-auth")
    const filePath = path.join(worktree, "specs", "001-auth", "tasks.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("tasks: Auth")
    expect(content).toContain("Content pending skill generation")
  })

  it("sets spec.json phase to tasks with approvals", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    const sj = await readSpecJson(path.join(worktree, "specs", "001-auth"))
    expect(sj?.phase).toBe("tasks")
    expect(sj?.approvals.plan.approved).toBe(true)
    expect(sj?.approvals.tasks.generated).toBe(true)
  })

  it("returns nextCommand /impl", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "tasks" },
      ctx,
    )
    expect(result.metadata?.nextCommand).toContain("/impl")
  })
})

// ── Lifecycle: spec → plan → tasks in same directory ─────────

describe("spec to plan to tasks lifecycle", () => {
  it("places plan.md and tasks.md in the same directory as spec.md", async () => {
    const r1 = await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    expect(r1.metadata?.featureDir).toBe("001-auth")

    const r2 = await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    expect(r2.metadata?.featureDir).toBe("001-auth")
    expect(r2.metadata?.phase).toBe("plan")

    const r3 = await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    expect(r3.metadata?.featureDir).toBe("001-auth")
    expect(r3.metadata?.phase).toBe("tasks")

    const specPath = path.join(worktree, "specs", "001-auth", "spec.md")
    const planPath = path.join(worktree, "specs", "001-auth", "plan.md")
    const tasksPath = path.join(worktree, "specs", "001-auth", "tasks.md")
    const specExists = await fs.access(specPath).then(() => true).catch(() => false)
    const planExists = await fs.access(planPath).then(() => true).catch(() => false)
    const tasksExists = await fs.access(tasksPath).then(() => true).catch(() => false)
    expect(specExists).toBe(true)
    expect(planExists).toBe(true)
    expect(tasksExists).toBe(true)

    const sj = await readSpecJson(path.join(worktree, "specs", "001-auth"))
    expect(sj?.phase).toBe("tasks")
    expect(sj?.approvals.spec.generated).toBe(true)
    expect(sj?.approvals.spec.approved).toBe(true)
    expect(sj?.approvals.plan.generated).toBe(true)
    expect(sj?.approvals.plan.approved).toBe(true)
    expect(sj?.approvals.tasks.generated).toBe(true)
  })

  it("creates new directory when plan is called without a prior spec", async () => {
    const result = await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    expect(result.metadata?.featureDir).toBe("001-auth")
    expect(result.metadata?.phase).toBe("plan")
  })

  it("creates new directory when tasks is called without a prior spec", async () => {
    const result = await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    expect(result.metadata?.featureDir).toBe("001-auth")
    expect(result.metadata?.phase).toBe("tasks")
  })
})

// ── Per-feature optional scaffolds ───────────────────────────

describe("scaffold data-model", () => {
  it("creates data-model.md inside an existing feature dir", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "data-model" },
      ctx,
    )
    expect(result.title).toBe("data-model.md created")
    const filePath = path.join(worktree, "specs", "001-auth", "data-model.md")
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it("returns error when no feature directories exist", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "data-model" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.metadata?.error).toContain("no features exist")
  })
})

describe("scaffold research", () => {
  it("creates research.md inside an existing feature dir", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "research" },
      ctx,
    )
    expect(result.title).toBe("research.md created")
    const filePath = path.join(worktree, "specs", "001-auth", "research.md")
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })
})

describe("scaffold contracts", () => {
  it("creates contracts/ directory inside an existing feature dir", async () => {
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "contracts" },
      ctx,
    )
    expect(result.title).toContain("created")
    const dirPath = path.join(worktree, "specs", "001-auth", "contracts")
    const stat = await fs.stat(dirPath)
    expect(stat.isDirectory()).toBe(true)
  })
})

// ── Edge cases ───────────────────────────────────────────────

describe("scaffold edge cases", () => {
  it("starting number is 001 when specs/ is empty", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "First", template: "spec" },
      ctx,
    )
    expect(result.metadata?.featureNumber).toBe(1)
    expect(result.metadata?.featureDir).toMatch(/^001-/)
  })

  it("increments feature number with each new feature", async () => {
    await scaffoldTool.execute({ featureName: "F1", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "F2", template: "spec" }, ctx)
    const dirs = await fs.readdir(path.join(worktree, "specs"))
    expect(dirs).toContain("001-f1")
    expect(dirs).toContain("002-f2")
  })

  it("handles special characters in feature name", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "User Auth & Profile Management!", template: "spec" },
      ctx,
    )
    expect(result.metadata?.featureDir).toBe("001-user-auth-profile-management")
  })

  it("returns error when template file is missing", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Test", template: "spec" },
      ctx,
    )
    expect(result.title).toBe("Scaffold: 001-test")
    expect(result.metadata?.featureDir).toBe("001-test")
  })

  it("data-model falls back to latest feature dir with numeric sorting (F-6)", async () => {
    await scaffoldTool.execute({ featureName: "Alpha", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Beta", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Gamma", template: "spec" }, ctx)
    const result = await scaffoldTool.execute(
      { featureName: "Gamma", template: "data-model" },
      ctx,
    )
    expect(result.metadata?.featureDir).toBe("003-gamma")
  })
})
