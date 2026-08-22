import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import deltaTool from "../../speckit-delta"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { readSpecJson, specsDirPath } from "../../shared/types"
import { readFrontmatter } from "../../shared/io"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
  await createConstitution(worktree)
  await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

async function getFeatureDir(): Promise<string> {
  const dirs = await fs.readdir(specsDirPath(worktree))
  return path.join(specsDirPath(worktree), dirs[0])
}

describe("1. spec-delta creates file with frontmatter", () => {
  it("creates delta spec with correct frontmatter", async () => {
    const featureDir = await getFeatureDir()
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    expect(result.title).toContain("Delta D001 created")
    const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
    const deltaSpec = deltaFiles.find(f => f.startsWith("D001") && f.endsWith(".md"))
    expect(deltaSpec).toBeDefined()
    const content = await fs.readFile(path.join(featureDir, "deltas", deltaSpec!), "utf-8")
    expect(content).toContain("delta_id: D001")
    expect(content).toContain("type: feature")
    expect(content).toContain("status: draft")
    expect(content).toContain("Add OAuth support")
  })

  it("updates deltas.json index", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
    const index = JSON.parse(indexRaw)
    expect(index.deltas).toHaveLength(1)
    expect(index.deltas[0].id).toBe("D001")
    expect(index.deltas[0].status).toBe("draft")
  })

  it("sets active_delta in spec.json", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    const sj = await readSpecJson(featureDir)
    expect(sj?.active_delta).toBe("D001")
  })
})

describe("2. spec-delta respects limit of 10", () => {
  it("rejects delta when limit reached", async () => {
    for (let i = 0; i < 10; i++) {
      await deltaTool.execute(
        { command: "spec-delta", description: `Delta ${i + 1}` },
        ctx,
      )
    }
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Delta 11" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Delta limit reached")
  })
})

describe("3. plan-delta creates incremental plan", () => {
  it("creates plan file for delta", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    const result = await deltaTool.execute(
      { command: "plan-delta", deltaId: "D001" },
      ctx,
    )
    expect(result.title).toContain("Plan Delta D001 created")
    const planPath = path.join(featureDir, "deltas", "D001-plan.md")
    const exists = await fs.access(planPath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
    const content = await fs.readFile(planPath, "utf-8")
    expect(content).toContain("delta_id: D001")
    expect(content).toContain("status: planned")
  })

  it("updates delta status to planned", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    await deltaTool.execute(
      { command: "plan-delta", deltaId: "D001" },
      ctx,
    )
    const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
    const index = JSON.parse(indexRaw)
    expect(index.deltas[0].status).toBe("planned")
  })
})

describe("4. tasks-delta creates incremental tasks", () => {
  it("creates tasks file for delta", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    await deltaTool.execute(
      { command: "plan-delta", deltaId: "D001" },
      ctx,
    )
    const result = await deltaTool.execute(
      { command: "tasks-delta", deltaId: "D001" },
      ctx,
    )
    expect(result.title).toContain("Tasks Delta D001 created")
    const tasksPath = path.join(featureDir, "deltas", "D001-tasks.md")
    const exists = await fs.access(tasksPath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
    const content = await fs.readFile(tasksPath, "utf-8")
    expect(content).toContain("delta_id: D001")
    expect(content).toContain("status: ready")
  })

  it("updates delta status to ready", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    await deltaTool.execute(
      { command: "plan-delta", deltaId: "D001" },
      ctx,
    )
    await deltaTool.execute(
      { command: "tasks-delta", deltaId: "D001" },
      ctx,
    )
    const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
    const index = JSON.parse(indexRaw)
    expect(index.deltas[0].status).toBe("ready")
  })
})

describe("5. impl-delta sets implementing status", () => {
  it("sets delta to implementing", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    await deltaTool.execute(
      { command: "plan-delta", deltaId: "D001" },
      ctx,
    )
    await deltaTool.execute(
      { command: "tasks-delta", deltaId: "D001" },
      ctx,
    )
    const result = await deltaTool.execute(
      { command: "impl-delta", deltaId: "D001" },
      ctx,
    )
    expect(result.title).toContain("Delta D001 implementing")
    const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
    const index = JSON.parse(indexRaw)
    expect(index.deltas[0].status).toBe("implementing")
  })
})

describe("6. impl-delta detects hash conflict", () => {
  it("warns when spec.md has been modified", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    await deltaTool.execute(
      { command: "plan-delta", deltaId: "D001" },
      ctx,
    )
    await deltaTool.execute(
      { command: "tasks-delta", deltaId: "D001" },
      ctx,
    )
    const specFp = path.join(featureDir, "spec.md")
    const specContent = await fs.readFile(specFp, "utf-8")
    await fs.writeFile(specFp, specContent + "\n\n## Modified\n", "utf-8")
    const result = await deltaTool.execute(
      { command: "impl-delta", deltaId: "D001" },
      ctx,
    )
    expect(result.output).toContain("implementing")
  })
})

describe("7. delta-status shows summary", () => {
  it("shows no deltas when none exist", async () => {
    const result = await deltaTool.execute(
      { command: "delta-status" },
      ctx,
    )
    expect(result.title).toBe("No deltas")
    expect(result.output).toContain("No deltas found")
  })

  it("shows delta summary with correct status", async () => {
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    const result = await deltaTool.execute(
      { command: "delta-status" },
      ctx,
    )
    expect(result.title).toContain("Delta Status")
    expect(result.output).toContain("D001")
    expect(result.output).toContain("1 active")
  })
})

describe("8. Consolidation updates spec.json", () => {
  it("sets active_delta in spec.json", async () => {
    const featureDir = await getFeatureDir()
    await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    const sj = await readSpecJson(featureDir)
    expect(sj?.active_delta).toBe("D001")
  })
})

describe("9. Complete roundtrip", () => {
  it("spec-delta -> plan-delta -> tasks-delta -> impl-delta", async () => {
    const r1 = await deltaTool.execute(
      { command: "spec-delta", description: "Add OAuth support" },
      ctx,
    )
    expect(r1.title).toContain("Delta D001 created")

    const r2 = await deltaTool.execute(
      { command: "plan-delta", deltaId: "D001" },
      ctx,
    )
    expect(r2.title).toContain("Plan Delta D001 created")

    const r3 = await deltaTool.execute(
      { command: "tasks-delta", deltaId: "D001" },
      ctx,
    )
    expect(r3.title).toContain("Tasks Delta D001 created")

    const r4 = await deltaTool.execute(
      { command: "impl-delta", deltaId: "D001" },
      ctx,
    )
    expect(r4.title).toContain("Delta D001 implementing")

    const featureDir = await getFeatureDir()
    const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
    const index = JSON.parse(indexRaw)
    expect(index.deltas[0].status).toBe("implementing")
  })
})
