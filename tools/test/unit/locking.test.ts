import { describe, it, expect } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  acquireLock,
  releaseLock,
  sleep,
  writeSession,
  readSession,
  DEFAULT_SESSION,
} from "../../shared/types"

async function worktree(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "lock-test-"))
}

// ── acquireLock ───────────────────────────────────────────

describe("acquireLock", () => {
  it("creates a lock directory", async () => {
    const tmp = await worktree()
    const target = path.join(tmp, "test.json")
    const handle = await acquireLock(target)
    await expect(fs.stat(handle.lockDir)).resolves.toBeDefined()
    await releaseLock(handle)
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it("returns a handle with lockDir and filePath", async () => {
    const tmp = await worktree()
    const target = path.join(tmp, "test.json")
    const handle = await acquireLock(target)
    expect(handle.filePath).toBe(target)
    expect(handle.lockDir).toBe(target + ".lock")
    await releaseLock(handle)
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it("throws LockTimeout when lock cannot be acquired within timeout", async () => {
    const tmp = await worktree()
    const target = path.join(tmp, "test.json")
    const handle1 = await acquireLock(target)
    await expect(acquireLock(target, { timeout: 100 })).rejects.toThrow("Lock timeout")
    await releaseLock(handle1)
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it("acquires lock after previous lock is released", async () => {
    const tmp = await worktree()
    const target = path.join(tmp, "test.json")
    const handle1 = await acquireLock(target)
    await releaseLock(handle1)
    const handle2 = await acquireLock(target)
    await releaseLock(handle2)
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it("steals a stale lock directory", async () => {
    const tmp = await worktree()
    const target = path.join(tmp, "test.json")
    const lockDir = target + ".lock"
    await fs.mkdir(lockDir, { recursive: true })
    // stale threshold 1s, lock json says 60s ago
    await fs.writeFile(
      path.join(lockDir, "lock.json"),
      JSON.stringify({ pid: 999999, createdAt: new Date(Date.now() - 60000).toISOString() }),
      "utf-8",
    )
    const handle = await acquireLock(target, { staleThreshold: 1000 })
    expect(handle.filePath).toBe(target)
    await releaseLock(handle)
    await fs.rm(tmp, { recursive: true, force: true })
  })
})

// ── releaseLock ───────────────────────────────────────────

describe("releaseLock", () => {
  it("removes the lock directory", async () => {
    const tmp = await worktree()
    const target = path.join(tmp, "test.json")
    const handle = await acquireLock(target)
    await releaseLock(handle)
    await expect(fs.stat(handle.lockDir)).rejects.toThrow()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it("is idempotent when called twice", async () => {
    const tmp = await worktree()
    const target = path.join(tmp, "test.json")
    const handle = await acquireLock(target)
    await releaseLock(handle)
    await expect(releaseLock(handle)).resolves.toBeUndefined()
    await fs.rm(tmp, { recursive: true, force: true })
  })
})

// ── sleep ─────────────────────────────────────────────────

describe("sleep", () => {
  it("resolves after at least the given milliseconds", async () => {
    const start = Date.now()
    await sleep(50)
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })
})
