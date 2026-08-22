import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

let tmpDir: string
const originalFs = { ...fs }

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chaos-test-"))
  await fs.mkdir(path.join(tmpDir, ".opencode", "spec-memory"), { recursive: true })
  await fs.mkdir(path.join(tmpDir, ".opencode", "backups"), { recursive: true })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function makeSession() {
  return {
    command: "test",
    phase: "spec" as const,
    featureDir: "specs/001-test",
    featureNumber: 1,
    featureName: "test",
    nextStep: "/plan",
    lastResult: null,
    history: [],
  }
}

function makeSpecJson() {
  return {
    feature_name: "test",
    feature_number: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    phase: "spec" as const,
    approvals: {
      spec: { generated: true, approved: false },
      plan: { generated: false, approved: false },
      tasks: { generated: false, approved: false },
    },
    ready_for_implementation: false,
  }
}

// ENOSPC in atomicWriteFile

describe("Chaos: ENOSPC in atomicWriteFile", () => {
  it("atomicWriteFile throws when writeFile fails with ENOSPC", async () => {
    const { atomicWriteFile } = await import("../../shared/io")
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }))

    await expect(atomicWriteFile(path.join(tmpDir, "test.json"), "{}")).rejects.toThrow()

    writeFileSpy.mockRestore()
  })

  it("atomicWriteFile cleans up tmp file on ENOSPC", async () => {
    const { atomicWriteFile } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    const writeFileSpy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }))

    await expect(atomicWriteFile(fp, "{}")).rejects.toThrow()

    await expect(fs.access(fp + ".tmp")).rejects.toThrow()

    writeFileSpy.mockRestore()
  })
})

// ENOSPC in writeWithBackup

describe("Chaos: ENOSPC in writeWithBackup", () => {
  it("writeWithBackup preserves original file when write fails", async () => {
    const { writeWithBackup } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    await fs.writeFile(fp, '{"original": true}', "utf-8")

    const writeFileSpy = vi.spyOn(fs, "writeFile")
      .mockImplementationOnce(async (_p, _d, _o) => {
        // first writeFile call is for the backup
      })
      .mockImplementationOnce(async (_p, _d, _o) => {
        // second writeFile call is for checksum
      })
      .mockRejectedValueOnce(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }))

    await expect(writeWithBackup(fp, '{"new": true}', tmpDir)).rejects.toThrow()

    const content = await fs.readFile(fp, "utf-8")
    expect(content).toBe('{"original": true}')

    writeFileSpy.mockRestore()
  })
})

// EACCES in acquireLock

describe("Chaos: EACCES in acquireLock", () => {
  it("acquireLock throws when mkdir fails with EACCES", async () => {
    const { acquireLock } = await import("../../shared/io")
    const mkdirSpy = vi.spyOn(fs, "mkdir").mockRejectedValueOnce(Object.assign(new Error("EACCES"), { code: "EACCES" }))

    await expect(acquireLock(path.join(tmpDir, "test.json"))).rejects.toThrow()

    mkdirSpy.mockRestore()
  })
})

// EBUSY in fs.rename

describe("Chaos: EBUSY in fs.rename", () => {
  it("atomicWriteFile throws when rename fails with EBUSY", async () => {
    const { atomicWriteFile } = await import("../../shared/io")
    const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(Object.assign(new Error("EBUSY"), { code: "EBUSY" }))

    await expect(atomicWriteFile(path.join(tmpDir, "test.json"), "{}")).rejects.toThrow()

    renameSpy.mockRestore()
  })

  it("atomicWriteFile cleans up tmp file on EBUSY", async () => {
    const { atomicWriteFile } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(Object.assign(new Error("EBUSY"), { code: "EBUSY" }))

    await expect(atomicWriteFile(fp, "{}")).rejects.toThrow()

    await expect(fs.access(fp + ".tmp")).rejects.toThrow()

    renameSpy.mockRestore()
  })
})

// EMFILE in parallel reads

describe("Chaos: EMFILE in parallel reads", () => {
  it("readSession handles EMFILE gracefully", async () => {
    const { readSession } = await import("../../shared/io")
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    await fs.writeFile(fp, JSON.stringify(makeSession()), "utf-8")

    const emfileError = Object.assign(new Error("EMFILE"), { code: "EMFILE" })
    const readFileSpy = vi.spyOn(fs, "readFile")
      .mockRejectedValueOnce(emfileError)
      .mockRejectedValueOnce(emfileError)
      .mockRejectedValueOnce(emfileError)

    const result = await readSession(tmpDir)
    expect(result).toBeDefined()
    expect(result.phase).toBe("init")

    readFileSpy.mockRestore()
  })

  it("readSpecJson handles EMFILE gracefully", async () => {
    const { readSpecJson } = await import("../../shared/io")
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")
    await fs.writeFile(fp, JSON.stringify(makeSpecJson()), "utf-8")

    const emfileError = Object.assign(new Error("EMFILE"), { code: "EMFILE" })
    const readFileSpy = vi.spyOn(fs, "readFile")
      .mockRejectedValueOnce(emfileError)
      .mockRejectedValueOnce(emfileError)
      .mockRejectedValueOnce(emfileError)

    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()

    readFileSpy.mockRestore()
  })
})

// ENOENT mid-operation

describe("Chaos: ENOENT mid-operation", () => {
  it("writeWithBackup handles ENOENT when backup dir disappears", async () => {
    const { writeWithBackup } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    await fs.writeFile(fp, '{"original": true}', "utf-8")

    const mkdirSpy = vi.spyOn(fs, "mkdir").mockImplementationOnce(async (p) => {
      if (String(p).includes("backups")) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      }
      await originalFs.mkdir(p as string, { recursive: true })
    })

    await expect(writeWithBackup(fp, '{"new": true}', tmpDir)).rejects.toThrow()

    mkdirSpy.mockRestore()
  })
})

// Partial write corruption

describe("Chaos: Partial write corruption", () => {
  it("readSession handles truncated JSON gracefully", async () => {
    const { readSession } = await import("../../shared/io")
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")

    await fs.writeFile(fp, '{"phase": "spec", "command": "test", "featureDir": null, "featureNumber": null, "featureName": null, "nextStep": null, "lastResult": null, "history": []', "utf-8")

    const result = await readSession(tmpDir)
    expect(result).toBeDefined()
    expect(result.phase).toBe("init")
  })

  it("readSpecJson handles truncated JSON gracefully", async () => {
    const { readSpecJson } = await import("../../shared/io")
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")

    await fs.writeFile(fp, '{"feature_name": "test", "feature_number": 1', "utf-8")

    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()
  })
})

// Corrupt backup .bak

describe("Chaos: Corrupt backup .bak", () => {
  it("findLatestValidBackup skips invalid backup content", async () => {
    const { findLatestValidBackup } = await import("../../shared/io")
    const { SessionStateSchema } = await import("../../shared/schemas")
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    const backupDir = path.join(tmpDir, ".opencode", "backups")

    const timestamp = Date.now()
    const bakFile = path.join(backupDir, `session.json.${timestamp}.bak`)
    await fs.writeFile(bakFile, "not valid json {{{", "utf-8")

    const result = await findLatestValidBackup(fp, tmpDir, SessionStateSchema)
    expect(result).toBeNull()
  })

  it("findLatestValidBackup returns valid backup when others are corrupt", async () => {
    const { findLatestValidBackup } = await import("../../shared/io")
    const { SessionStateSchema } = await import("../../shared/schemas")
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    const backupDir = path.join(tmpDir, ".opencode", "backups")

    const badBak = path.join(backupDir, `session.json.${Date.now() - 1000}.bak`)
    await fs.writeFile(badBak, "invalid", "utf-8")

    const goodBak = path.join(backupDir, `session.json.${Date.now()}.bak`)
    await fs.writeFile(goodBak, JSON.stringify(makeSession()), "utf-8")

    const result = await findLatestValidBackup(fp, tmpDir, SessionStateSchema)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe("spec")
  })
})

// Corrupt backup .sha256

describe("Chaos: Corrupt backup .sha256", () => {
  it("verifyChecksum returns false for corrupt checksum file", async () => {
    const verifyChecksum = async (bakPath: string, data: string): Promise<boolean> => {
      try {
        const { readFileSync } = await import("node:fs")
        const stored = readFileSync(`${bakPath}.sha256`, "utf-8")
        const { createHash } = await import("node:crypto")
        const computed = createHash("sha256").update(data).digest("hex")
        return stored.trim() === computed
      } catch {
        return false
      }
    }

    const backupDir = path.join(tmpDir, ".opencode", "backups")
    const bakFile = path.join(backupDir, "test.json.bak")
    await fs.writeFile(bakFile, '{"test": true}', "utf-8")
    await fs.writeFile(bakFile + ".sha256", "wronghashvalue", "utf-8")

    const result = await verifyChecksum(bakFile, '{"test": true}')
    expect(result).toBe(false)
  })

  it("verifyChecksum returns true for valid checksum file", async () => {
    const verifyChecksum = async (bakPath: string, data: string): Promise<boolean> => {
      try {
        const { readFileSync } = await import("node:fs")
        const stored = readFileSync(`${bakPath}.sha256`, "utf-8")
        const { createHash } = await import("node:crypto")
        const computed = createHash("sha256").update(data).digest("hex")
        return stored.trim() === computed
      } catch {
        return false
      }
    }

    const backupDir = path.join(tmpDir, ".opencode", "backups")
    const bakFile = path.join(backupDir, "test.json.bak")
    const content = '{"test": true}'
    await fs.writeFile(bakFile, content, "utf-8")
    const { createHash } = await import("node:crypto")
    const hash = createHash("sha256").update(content).digest("hex")
    await fs.writeFile(bakFile + ".sha256", hash, "utf-8")

    const result = await verifyChecksum(bakFile, content)
    expect(result).toBe(true)
  })
})

// Stale lock directory

describe("Chaos: Stale lock directory", () => {
  it("acquireLock detects and removes stale lock from dead process", async () => {
    const { acquireLock, releaseLock } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    const lockDir = fp + ".lock"
    await fs.mkdir(lockDir, { recursive: true })
    await fs.writeFile(
      path.join(lockDir, "lock.json"),
      JSON.stringify({ pid: 999999, createdAt: new Date(Date.now() - 60000).toISOString() }),
      "utf-8"
    )

    const handle = await acquireLock(fp, { timeout: 5000, staleThreshold: 1000 })
    expect(handle).toBeDefined()
    expect(handle.lockDir).toBe(lockDir)

    await releaseLock(handle)
  })

  it("acquireLock times out on non-stale lock", async () => {
    const { acquireLock } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    const lockDir = fp + ".lock"
    await fs.mkdir(lockDir, { recursive: true })
    await fs.writeFile(
      path.join(lockDir, "lock.json"),
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
      "utf-8"
    )

    await expect(acquireLock(fp, { timeout: 200, staleThreshold: 60000 })).rejects.toThrow("Lock timeout")
  })
})

// ENOSPC during rename

describe("Chaos: ENOSPC during rename", () => {
  it("atomicWriteFile fails gracefully when rename gets ENOSPC", async () => {
    const { atomicWriteFile } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }))

    await expect(atomicWriteFile(fp, '{"test": true}')).rejects.toThrow()

    await expect(fs.access(fp)).rejects.toThrow()
    await expect(fs.access(fp + ".tmp")).rejects.toThrow()

    renameSpy.mockRestore()
  })
})

// Symlink attack on project root

describe("Chaos: Symlink attack on project root", () => {
  it("isValidProjectRoot returns false when spec-memory is a symlink to /etc", async () => {
    const { isValidProjectRoot } = await import("../../shared/types")
    const specMemoryDir = path.join(tmpDir, ".opencode", "spec-memory")

    await fs.rm(specMemoryDir, { recursive: true })

    try {
      await fs.symlink("/etc", specMemoryDir)
    } catch {
      return
    }

    const result = await isValidProjectRoot(tmpDir)
    expect(result).toBe(false)
  })

  it("isValidProjectRoot returns true for normal directory", async () => {
    const { isValidProjectRoot } = await import("../../shared/types")
    const result = await isValidProjectRoot(tmpDir)
    expect(result).toBe(true)
  })
})

// Disk full during backup creation

describe("Chaos: Disk full during backup creation", () => {
  it("writeWithBackup handles ENOSPC during backup write", async () => {
    const { writeWithBackup } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    await fs.writeFile(fp, '{"original": true}', "utf-8")

    let callCount = 0
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockImplementation(async (p, d, o) => {
      callCount++
      if (callCount === 1) {
        return await originalFs.writeFile(p as string, d as string, o as any)
      }
      if (callCount === 2) {
        return await originalFs.writeFile(p as string, d as string, o as any)
      }
      throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" })
    })

    await expect(writeWithBackup(fp, '{"new": true}', tmpDir)).rejects.toThrow()

    const content = await fs.readFile(fp, "utf-8")
    expect(content).toBe('{"original": true}')

    writeFileSpy.mockRestore()
  })
})

// Permission denied on backup directory

describe("Chaos: Permission denied on backup directory", () => {
  it("writeWithBackup handles EACCES on backup directory", async () => {
    const { writeWithBackup } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    await fs.writeFile(fp, '{"original": true}', "utf-8")

    const mkdirSpy = vi.spyOn(fs, "mkdir").mockImplementationOnce(async (p) => {
      if (String(p).includes("backups")) {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" })
      }
      await originalFs.mkdir(p as string, { recursive: true })
    })

    await expect(writeWithBackup(fp, '{"new": true}', tmpDir)).rejects.toThrow()

    mkdirSpy.mockRestore()
  })
})

// File replaced between read and write

describe("Chaos: File replaced between read and write", () => {
  it("writeWithBackup handles file change during backup read", async () => {
    const { writeWithBackup } = await import("../../shared/io")
    const fp = path.join(tmpDir, "test.json")

    await fs.writeFile(fp, '{"version": 1}', "utf-8")

    const readFileSpy = vi.spyOn(fs, "readFile").mockImplementationOnce(async (p, o) => {
      if (String(p) === fp) {
        return '{"version": 2}'
      }
      return originalFs.readFile(p as string, o as any)
    })

    await writeWithBackup(fp, '{"version": 3}', tmpDir)

    const content = await fs.readFile(fp, "utf-8")
    expect(content).toBe('{"version": 3}')

    readFileSpy.mockRestore()
  })
})
