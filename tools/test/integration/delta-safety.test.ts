import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import deltaTool from "../../speckit-delta"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { makeDelta, makeDeltaIndex, specsDirPath } from "../../shared/types"

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

function deltasDirOf(featureDir: string): string {
  return path.join(featureDir, "deltas")
}

function indexOf(featureDir: string): string {
  return path.join(deltasDirOf(featureDir), "deltas.json")
}

describe("delta path safety", () => {
  it("rejects featureDir with parent traversal", async () => {
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Evil", featureDir: "../../evil" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Invalid featureDir")
  })

  it("rejects featureDir with forward slash", async () => {
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Evil", featureDir: "sub/dir" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Invalid featureDir")
  })

  it("rejects featureDir with backslash", async () => {
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Evil", featureDir: "sub\\dir" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Invalid featureDir")
  })

  it("rejects absolute featureDir", async () => {
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Evil", featureDir: "C:\\Windows" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Invalid featureDir")
  })

  it("rejects dot-dot featureDir", async () => {
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Evil", featureDir: ".." },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Invalid featureDir")
  })

  it("does not create any deltas dir for rejected traversal", async () => {
    await deltaTool.execute(
      { command: "spec-delta", description: "Evil", featureDir: "../../evil" },
      ctx,
    )
    const featureDir = await getFeatureDir()
    const deltasExists = await fs.access(deltasDirOf(featureDir)).then(() => true, () => false)
    expect(deltasExists).toBe(false)
  })

  it("accepts a valid explicit featureDir", async () => {
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Valid", featureDir: "001-test-feature" },
      ctx,
    )
    expect(result.title).toContain("Delta D001 created")
  })

  it("rejects ambiguous feature selection with multiple features", async () => {
    await scaffoldTool.execute({ featureName: "Second Feature", template: "spec" }, ctx)
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "No match here" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Multiple features found")
  })

  it("still auto-selects when only one feature exists", async () => {
    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Solo delta" },
      ctx,
    )
    expect(result.title).toContain("D001 created")
  })
})

describe("delta index corruption safety", () => {
  it("refuses to overwrite a corrupt index on spec-delta", async () => {
    const featureDir = await getFeatureDir()
    await fs.mkdir(deltasDirOf(featureDir), { recursive: true })
    await fs.writeFile(indexOf(featureDir), "{corrupt", "utf-8")

    const result = await deltaTool.execute(
      { command: "spec-delta", description: "Should fail" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("corrupt")
    const content = await fs.readFile(indexOf(featureDir), "utf-8")
    expect(content).toBe("{corrupt")
  })

  it("refuses to overwrite a corrupt index on delta-status", async () => {
    const featureDir = await getFeatureDir()
    await fs.mkdir(deltasDirOf(featureDir), { recursive: true })
    await fs.writeFile(indexOf(featureDir), "not json at all", "utf-8")

    const result = await deltaTool.execute({ command: "delta-status" }, ctx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("corrupt")
  })

  it("refuses schema-invalid index", async () => {
    const featureDir = await getFeatureDir()
    await fs.mkdir(deltasDirOf(featureDir), { recursive: true })
    await fs.writeFile(indexOf(featureDir), JSON.stringify({ feature: "x", deltas: "nope" }), "utf-8")

    const result = await deltaTool.execute({ command: "spec-delta", description: "nope" }, ctx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("corrupt")
  })
})

describe("delta limit ignores consolidated deltas", () => {
  it("allows new delta when 10 consolidated deltas exist", async () => {
    const featureDir = await getFeatureDir()
    const dirName = path.basename(featureDir)
    const index = makeDeltaIndex(dirName)
    for (let i = 1; i <= 10; i++) {
      const d = makeDelta(`D${String(i).padStart(3, "0")}`, "feature", `Old delta ${i}`, "medium", dirName)
      d.status = "consolidated"
      index.deltas.push(d)
    }
    await fs.mkdir(deltasDirOf(featureDir), { recursive: true })
    await fs.writeFile(indexOf(featureDir), JSON.stringify(index, null, 2), "utf-8")

    const result = await deltaTool.execute(
      { command: "spec-delta", description: "New delta" },
      ctx,
    )
    expect(result.title).toContain("D011 created")
  })

  it("still rejects when 10 non-consolidated deltas exist", async () => {
    await deltaTool.execute({ command: "spec-delta", description: "Seed" }, ctx)
    for (let i = 2; i <= 10; i++) {
      await deltaTool.execute({ command: "spec-delta", description: `Delta ${i}` }, ctx)
    }
    const result = await deltaTool.execute({ command: "spec-delta", description: "Delta 11" }, ctx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Delta limit reached")
  })
})

describe("delta consolidation idempotence", () => {
  async function completeDeltaFlow(): Promise<string> {
    const featureDir = await getFeatureDir()
    await fs.writeFile(path.join(featureDir, "plan.md"), "# Plan\n\nBase plan.\n", "utf-8")
    await fs.writeFile(path.join(featureDir, "tasks.md"), "# Tasks\n\nBase tasks.\n", "utf-8")
    await deltaTool.execute({ command: "spec-delta", description: "Add OAuth support" }, ctx)
    await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
    await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
    await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
    await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
    return featureDir
  }

  it("reports already consolidated on re-run", async () => {
    await completeDeltaFlow()
    const result = await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
    expect(result.title).toContain("already consolidated")
  })

  it("does not duplicate the merged section on re-run", async () => {
    const featureDir = await completeDeltaFlow()
    await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
    const planAfter = await fs.readFile(path.join(featureDir, "plan.md"), "utf-8")
    const occurrences = planAfter.split("## Delta D001").length - 1
    expect(occurrences).toBe(1)
  })

  it("recovers consolidation when only some files were merged (crash simulation)", async () => {
    const featureDir = await getFeatureDir()
    const planFp = path.join(featureDir, "plan.md")
    const tasksFp = path.join(featureDir, "tasks.md")

    await fs.writeFile(planFp, "# Plan\n\nBase plan.\n", "utf-8")
    await fs.writeFile(tasksFp, "# Tasks\n\nBase tasks.\n", "utf-8")
    await deltaTool.execute({ command: "spec-delta", description: "Add OAuth support" }, ctx)
    await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
    await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
    await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

    // Simulate a crash after plan.md was merged but before index write:
    // plan.md already contains the section, status is still implementing
    await fs.writeFile(
      planFp,
      "# Plan\n\nBase plan.\n\n---\n\n## Delta D001: Add OAuth support\n\nAlready merged body.\n",
      "utf-8",
    )

    const result = await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
    expect(result.title).toContain("consolidated")
    const planAfter = await fs.readFile(planFp, "utf-8")
    expect(planAfter.split("## Delta D001").length - 1).toBe(1)
    const tasksAfter = await fs.readFile(tasksFp, "utf-8")
    expect(tasksAfter).toContain("## Delta D001")
  })

  it("creates a backup of the previous index on write", async () => {
    await deltaTool.execute({ command: "spec-delta", description: "First" }, ctx)
    await deltaTool.execute({ command: "spec-delta", description: "Second" }, ctx)

    const backupDir = path.join(worktree, ".opencode", "backups")
    const files = await fs.readdir(backupDir)
    const indexBackups = files.filter(f => f.startsWith("deltas.json.") && f.endsWith(".bak"))
    expect(indexBackups.length).toBeGreaterThanOrEqual(1)
  })
})
