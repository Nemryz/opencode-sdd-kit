import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import scaffoldTool from "../../speckit-scaffold"
import validateTool from "../../speckit-validate"
import statusTool from "../../speckit-status"
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
})
