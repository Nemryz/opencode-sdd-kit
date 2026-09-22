import { describe, it, expect, beforeEach, afterEach } from "vitest"
import path from "node:path"
import phaseTool from "../../speckit-phase"
import approveTool from "../../speckit-approve"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"
import { readSession, readSpecJson, writeSpecJson, specsDirPath } from "../../shared/types"
import { readFrontmatter } from "../../shared/io"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

async function featureDirOf(name = "001-test-feature"): Promise<string> {
  return path.join(specsDirPath(worktree), name)
}

async function setupApproved(): Promise<string> {
  await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
  await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
  await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
  await approveTool.execute({ artifact: "spec", confirmed: true }, ctx)
  await approveTool.execute({ artifact: "plan", confirmed: true }, ctx)
  await approveTool.execute({ artifact: "tasks", confirmed: true }, ctx)
  return featureDirOf()
}

describe("phase tool", () => {
  it("moves ready -> impl and updates spec.json and session", async () => {
    const featureDir = await setupApproved()
    const result = await phaseTool.execute({ phase: "impl" }, ctx)
    expect(result.title).toBe("Phase: impl")
    expect(result.metadata?.previousPhase).toBe("ready")

    const sj = await readSpecJson(featureDir)
    expect(sj?.phase).toBe("impl")

    const session = await readSession(worktree)
    expect(session.phase).toBe("impl")
    expect(session.command).toBe("/phase")
    expect(session.history).toContain("/phase impl")
  })

  it("syncs artifact frontmatter phase for spec.md", async () => {
    const featureDir = await setupApproved()
    await phaseTool.execute({ phase: "impl" }, ctx)
    const fm = await readFrontmatter(path.join(featureDir, "spec.md"))
    expect(fm?.phase).toBe("impl")
  })

  it("moves impl -> complete with review next step", async () => {
    const featureDir = await setupApproved()
    await phaseTool.execute({ phase: "impl" }, ctx)
    const result = await phaseTool.execute({ phase: "complete" }, ctx)
    expect(result.title).toBe("Phase: complete")

    const sj = await readSpecJson(featureDir)
    expect(sj?.phase).toBe("complete")

    const session = await readSession(worktree)
    expect(session.phase).toBe("complete")
    expect(session.nextStep).toContain("/review")
  })

  it("is idempotent when already in the target phase", async () => {
    await setupApproved()
    await phaseTool.execute({ phase: "impl" }, ctx)
    const result = await phaseTool.execute({ phase: "impl" }, ctx)
    expect(result.output).toContain("Already in impl")
  })

  it("rejects impl when tasks are not approved", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const result = await phaseTool.execute({ phase: "impl" }, ctx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("/approve tasks")
  })

  it("rejects invalid transition spec -> impl", async () => {
    const featureDir = await setupApproved()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.phase = "spec"
      await writeSpecJson(sj, featureDir)
    }
    const result = await phaseTool.execute({ phase: "impl" }, ctx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Cannot move to impl from spec")
  })

  it("rejects complete from ready", async () => {
    await setupApproved()
    const result = await phaseTool.execute({ phase: "complete" }, ctx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Expected current phase: impl")
  })

  it("errors when no feature exists", async () => {
    const result = await phaseTool.execute({ phase: "impl" }, ctx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("No feature found")
  })

  it("errors on invalid project root", async () => {
    const badCtx = mockContext(path.join(worktree, "nope"))
    const result = await phaseTool.execute({ phase: "impl" }, badCtx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Not a valid project directory")
  })
})
