import { describe, it, expect } from "vitest"
import { mockContext, createTempWorktree, destroyTempWorktree } from "./setup"
import fs from "node:fs/promises"
import path from "node:path"

describe("mockContext", () => {
  it("returns a ToolContext with the given worktree", () => {
    const ctx = mockContext("/tmp/test")
    expect(ctx.worktree).toBe("/tmp/test")
    expect(ctx.directory).toBe("/tmp/test")
    expect(ctx.sessionID).toBe("test")
    expect(typeof ctx.metadata).toBe("function")
    expect(typeof ctx.ask).toBe("function")
    expect(ctx.abort).toBeInstanceOf(AbortSignal)
  })
})

describe("createTempWorktree", () => {
  it("creates a temp directory with constitution.md", async () => {
    const dir = await createTempWorktree()
    try {
      const constitutionPath = path.join(dir, ".opencode", "spec-memory", "constitution.md")
      const content = await fs.readFile(constitutionPath, "utf-8")
      expect(content).toContain("Test Constitution")
    } finally {
      await destroyTempWorktree(dir)
    }
  })

  it("creates a unique directory each time", async () => {
    const dir1 = await createTempWorktree()
    const dir2 = await createTempWorktree()
    expect(dir1).not.toBe(dir2)
    await destroyTempWorktree(dir1)
    await destroyTempWorktree(dir2)
  })
})
