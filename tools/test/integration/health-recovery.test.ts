import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import healthTool from "../../speckit-health"
import statusTool from "../../speckit-status"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"
import { createSnapshot, readRestoreJournal, writeRestoreJournal } from "../../shared/snapshot"

let worktree: string
let ctx: ReturnType<typeof mockContext>

async function write(rel: string, content: string): Promise<void> {
  const abs = path.join(worktree, ...rel.split("/"))
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, "utf-8")
}

async function read(rel: string): Promise<string> {
  return fs.readFile(path.join(worktree, ...rel.split("/")), "utf-8")
}

async function seedFeature(): Promise<void> {
  await write(".opencode/spec-memory/session.json", JSON.stringify({
    command: "/status",
    phase: "ready",
    featureDir: "001-demo",
    featureNumber: 1,
    featureName: "demo",
    nextStep: "/impl",
    lastResult: null,
    history: [],
  }))
  await write(".opencode/spec-memory/constitution.md", "# Constitution\n")
  await write("specs/001-demo/spec.md", "# Spec\n")
}

async function writePendingJournal(safetySnapshotId: string): Promise<void> {
  await writeRestoreJournal(worktree, {
    format: 1,
    snapshot_id: "20990101-000000-manual",
    safety_snapshot_id: safetySnapshotId,
    mode: "full",
    started_at: new Date().toISOString(),
    files: [],
    removed: [],
  })
}

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

describe("health restore recovery", () => {
  it("reports a pending interrupted restore", async () => {
    await seedFeature()
    await writePendingJournal("20990101-000000-missing")
    const result = await healthTool.execute({} as never, ctx)
    expect(result.output).toContain("Interrupted restore pending")
    expect(result.output).toContain("Recovery Readiness: NOT READY")
  })

  it("recovers the interrupted restore with fix: true", async () => {
    await seedFeature()
    const safety = await createSnapshot(worktree, { trigger: "pre-restore:crash" })
    await writePendingJournal(safety.id)
    await write("specs/001-demo/spec.md", "# Half restored\n")
    await write("specs/001-demo/extra.md", "extra\n")

    const result = await healthTool.execute({ fix: true } as never, ctx)
    expect(result.output).toContain(`recovered from safety snapshot ${safety.id}`)
    expect(await read("specs/001-demo/spec.md")).toBe("# Spec\n")
    expect(await fs.stat(path.join(worktree, "specs", "001-demo", "extra.md")).catch(() => null)).toBeNull()
    expect(await readRestoreJournal(worktree)).toBeNull()
  })

  it("includes snapshot recovery readiness in the report", async () => {
    await seedFeature()
    const result = await healthTool.execute({} as never, ctx)
    expect(result.output).toContain("Snapshots: 0 | Recovery Readiness: NOT READY")
    expect(result.output).toContain("no snapshots yet")
  })

  it("restores a corrupted guard.json from backup", async () => {
    await seedFeature()
    const guardTool = (await import("../../speckit-guard")).default
    await guardTool.execute({ subcommand: "on" } as never, ctx)
    await guardTool.execute({ subcommand: "off", confirmed: true } as never, ctx)
    await write(".opencode/guard.json", "NOT JSON")

    const result = await healthTool.execute({ fix: true } as never, ctx)
    expect(result.output).toContain("guard.json: restored from backup")
    const raw = await read(".opencode/guard.json")
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})

describe("status journal warning", () => {
  it("warns when an interrupted restore is pending", async () => {
    await seedFeature()
    await writePendingJournal("20990101-000000-missing")
    const result = await statusTool.execute({} as never, ctx)
    expect(result.output).toContain("[INTERRUPTED RESTORE] pending")
    expect(result.metadata?.interruptedRestore).toBe(true)
  })
})
