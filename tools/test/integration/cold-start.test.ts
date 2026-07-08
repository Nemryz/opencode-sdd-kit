import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import scaffoldTool from "../../speckit-scaffold"
import validateTool from "../../speckit-validate"
import statusTool from "../../speckit-status"
import auditTool from "../../speckit-audit"
import cleanTool from "../../speckit-clean"
import { mockContext } from "../helpers/setup"
import { isValidProjectRoot, sessionPath, specsDirPath } from "../../shared/types"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "cold-start-"))
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

describe("cold start from completely empty directory", () => {
  it("isValidProjectRoot returns false before constitution", async () => {
    expect(await isValidProjectRoot(worktree)).toBe(false)
  })

  it("constitution creation succeeds on empty directory (bypasses root check)", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "My Project", template: "constitution" },
      ctx,
    )
    expect(result.title).toBe("Constitution created")
    expect(await isValidProjectRoot(worktree)).toBe(true)
  })

  it("spec creation fails before constitution is created", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Not a valid project directory")
  })

  it("full bootstrap sequence: constitution first, then spec", async () => {
    const r1 = await scaffoldTool.execute(
      { featureName: "My Project", template: "constitution" },
      ctx,
    )
    expect(r1.title).toBe("Constitution created")

    const r2 = await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    expect(r2.metadata?.featureDir).toBe("001-auth")

    const specPath = path.join(specsDirPath(worktree), "001-auth", "spec.md")
    const specContent = await fs.readFile(specPath, "utf-8")
    expect(specContent).toContain("Auth")
  })

  it("validate works after constitution bootstrap", async () => {
    await scaffoldTool.execute(
      { featureName: "My Project", template: "constitution" },
      ctx,
    )
    await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    const v = await validateTool.execute({}, ctx)
    expect(v.metadata?.phase).toBe("spec")
    expect(v.metadata?.artifacts?.spec).toBe(true)
  })

  it("status reports correctly after cold start bootstrap", async () => {
    await scaffoldTool.execute(
      { featureName: "My Project", template: "constitution" },
      ctx,
    )
    await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    const s = await statusTool.execute({}, ctx)
    expect(s.metadata?.featureCount).toBe(1)
    expect(s.output).toContain("001-auth")
  })

  it("steering fails before constitution (only constitution is the entry point)", async () => {
    const r = await scaffoldTool.execute(
      { featureName: "MyKit", template: "steering" },
      ctx,
    )
    expect(r.title).toBe("Error")
    expect(r.output).toContain("Not a valid project directory")
  })

  it("constitution content includes project name after bootstrap", async () => {
    await scaffoldTool.execute(
      { featureName: "ColdStartApp", template: "constitution" },
      ctx,
    )
    const filePath = path.join(worktree, ".opencode", "spec-memory", "constitution.md")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain("ColdStartApp")
    expect(content).toContain("Constitution")
  })

  it("session.json is properly written after constitution bootstrap", async () => {
    await scaffoldTool.execute(
      { featureName: "Test App", template: "constitution" },
      ctx,
    )
    await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    const session = JSON.parse(
      await fs.readFile(sessionPath(worktree), "utf-8"),
    )
    expect(session.featureDir).toBe("001-auth")
    expect(session.phase).toBe("spec")
    expect(session.command).toBe("/spec")
  })

  it("audit works after cold start bootstrap", async () => {
    await scaffoldTool.execute(
      { featureName: "My Project", template: "constitution" },
      ctx,
    )
    await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    const result = await auditTool.execute({}, ctx)
    expect(result.title).not.toBe("Error")
    expect(result.metadata?.errorCount).toBe(0)
  })

  it("clean works after cold start bootstrap", async () => {
    await scaffoldTool.execute(
      { featureName: "My Project", template: "constitution" },
      ctx,
    )
    await scaffoldTool.execute(
      { featureName: "Auth", template: "spec" },
      ctx,
    )
    const result = await cleanTool.execute({}, ctx)
    expect(result.metadata?.total).toBe(1)
  })
})
