import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import guardTool from "../../speckit-guard"
import guardPlugin from "../../plugins/speckit-guard"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"

let worktree: string
let ctx: ReturnType<typeof mockContext>

async function write(rel: string, content: string): Promise<void> {
  const abs = path.join(worktree, ...rel.split("/"))
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, "utf-8")
}

async function backupFiles(): Promise<string[]> {
  const dir = path.join(worktree, ".opencode", "backups")
  const files = await fs.readdir(dir).catch(() => [] as string[])
  return files.filter(f => f.endsWith(".bak"))
}

async function seedSession(): Promise<void> {
  await write(".opencode/spec-memory/session.json", JSON.stringify({
    command: "/status",
    phase: "ready",
    featureDir: null,
    featureNumber: null,
    featureName: null,
    nextStep: "/spec <description>",
    lastResult: null,
    history: [],
  }))
}

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

describe("guard.json backups", () => {
  it("guard tool creates a backup when rewriting the config", async () => {
    await seedSession()
    await guardTool.execute({ subcommand: "on" } as never, ctx)
    const before = await backupFiles()
    await guardTool.execute({ subcommand: "off", confirmed: true } as never, ctx)
    const after = await backupFiles()
    expect(after.length).toBeGreaterThan(before.length)
    expect(after.some(f => f.includes("guard"))).toBe(true)
  })

  it("guard plugin creates a backup on repeated denials", async () => {
    await seedSession()
    const hooks = await guardPlugin.server({ worktree } as never)
    for (let i = 0; i < 2; i++) {
      await hooks["tool.execute.before"]!(
        { tool: "bash", sessionID: "s1", callID: `c${i}` } as never,
        { args: { command: "echo hi > .opencode/spec-memory/session.json" } } as never,
      ).catch(() => {})
    }
    const files = await backupFiles()
    expect(files.some(f => f.includes("guard"))).toBe(true)
  })
})
