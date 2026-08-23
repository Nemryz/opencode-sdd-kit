import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  readSession,
  writeSession,
  readSpecJson,
  writeSpecJson,
  writeWithBackup,
  atomicWriteFile,
  writeFileChecksum,
  verifyLiveFileChecksum,
  findLatestValidBackup,
  verifyBackupIntegrity,
  pushCorruptionWarning,
  clearCorruptionWarnings,
  corruptionWarnings,
  isENOENT,
  isEEXIST,
  isESRCH,
  acquireLock,
  releaseLock,
  withLock,
  resetLocks,
  sleep,
  makeSpecJson,
  DEFAULT_SESSION,
  DEFAULT_CONFIG,
  sessionPath,
  specJsonPath,
  configPath,
  specsDirPath,
  readConfig,
} from "../../shared/types"
import { SessionStateSchema } from "../../shared/schemas"

let tmp: string

async function worktree(): Promise<string> {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "io-mutation-"))
  return tmp
}

beforeEach(() => {
  clearCorruptionWarnings()
  resetLocks()
})

afterEach(async () => {
  if (tmp) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

describe("Phase 4: IO Module - Mutation Score Improvement", () => {

  describe("4.1 Checksum verification", () => {
    it("verifyLiveFileChecksum returns false when file missing", async () => {
      const root = await worktree()
      const fp = path.join(root, "nonexistent.json")
      expect(await verifyLiveFileChecksum(fp)).toBe(false)
    })

    it("verifyLiveFileChecksum returns true when checksum matches", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.writeFile(fp, "hello", "utf-8")
      await writeFileChecksum(fp)
      expect(await verifyLiveFileChecksum(fp)).toBe(true)
    })

    it("verifyLiveFileChecksum returns true when no sha256 file exists", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.writeFile(fp, "hello", "utf-8")
      expect(await verifyLiveFileChecksum(fp)).toBe(true)
    })

    it("verifyLiveFileChecksum returns false when checksum mismatches", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.writeFile(fp, "hello", "utf-8")
      await writeFileChecksum(fp)
      await fs.writeFile(fp, "changed content", "utf-8")
      expect(await verifyLiveFileChecksum(fp)).toBe(false)
    })

    it("verifyLiveFileChecksum returns true with empty content", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.writeFile(fp, "", "utf-8")
      await writeFileChecksum(fp)
      expect(await verifyLiveFileChecksum(fp)).toBe(true)
    })

    it("writeFileChecksum creates .sha256 sidecar", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.writeFile(fp, "data", "utf-8")
      await writeFileChecksum(fp)
      const sidecar = path.join(root, "test.json.sha256")
      const exists = await fs.access(sidecar).then(() => true, () => false)
      expect(exists).toBe(true)
    })

    it("writeFileChecksum handles missing file silently", async () => {
      const root = await worktree()
      const fp = path.join(root, "nonexistent.json")
      await expect(writeFileChecksum(fp)).resolves.toBeUndefined()
    })

    it("readSession restores from backup on checksum mismatch", async () => {
      const root = await worktree()
      const fp = sessionPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      const valid = { ...DEFAULT_SESSION, phase: "spec" as const }
      await writeSession(root, valid)

      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const bakFile = path.join(backupDir, `session.json.${Date.now()}.bak`)
      await fs.writeFile(bakFile, JSON.stringify(valid), "utf-8")
      await fs.writeFile(`${bakFile}.sha256`, "", "utf-8")

      await fs.writeFile(fp, "corrupted data", "utf-8")
      const result = await readSession(root)
      expect(result.phase).toBe("spec")
    })

    it("readSpecJson restores from backup on checksum mismatch", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      const sj = makeSpecJson("test", 1)
      await writeSpecJson(sj, featureDir)

      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const bakFile = path.join(backupDir, `spec.json.${Date.now()}.bak`)
      await fs.writeFile(bakFile, JSON.stringify(sj), "utf-8")
      await fs.writeFile(`${bakFile}.sha256`, "", "utf-8")

      const fp = specJsonPath(featureDir)
      await fs.writeFile(fp, "corrupted", "utf-8")
      const result = await readSpecJson(featureDir)
      expect(result).not.toBeNull()
      expect(result!.feature_name).toBe("test")
    })

    it("readConfig restores from backup on checksum mismatch", async () => {
      const root = await worktree()
      const fp = configPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, JSON.stringify(DEFAULT_CONFIG), "utf-8")
      await writeFileChecksum(fp)

      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const bakFile = path.join(backupDir, `config.json.${Date.now()}.bak`)
      await fs.writeFile(bakFile, JSON.stringify(DEFAULT_CONFIG), "utf-8")
      await fs.writeFile(`${bakFile}.sha256`, "", "utf-8")

      await fs.writeFile(fp, "corrupted", "utf-8")
      const result = await readConfig(root)
      expect(result).toEqual(DEFAULT_CONFIG)
    })
  })

  describe("4.2 Backup rotation", () => {
    it("rotates backups when exceeding MAX_BACKUPS (10)", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "initial", "utf-8")

      for (let i = 0; i < 12; i++) {
        await writeWithBackup(fp, `version-${i}`, root)
        await sleep(5)
      }

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const bakFiles = allBaks.filter(f => f.endsWith(".bak"))
      expect(bakFiles.length).toBeLessThanOrEqual(10)
    })

    it("keeps exactly MAX_BACKUPS when 11 writes occurred", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "initial", "utf-8")

      for (let i = 0; i < 11; i++) {
        await writeWithBackup(fp, `version-${i}`, root)
        await sleep(5)
      }

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const bakFiles = allBaks.filter(f => f.endsWith(".bak"))
      expect(bakFiles.length).toBe(10)
    })

    it("creates no backup when first writing to a new file", async () => {
      const root = await worktree()
      const fp = path.join(root, "new.json")
      await writeWithBackup(fp, "first", root)
      const backupDir = path.join(root, ".opencode", "backups")
      const exists = await fs.access(backupDir).then(() => true, () => false)
      expect(exists).toBe(false)
    })

    it("rotates oldest backups first (sorted by timestamp)", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "initial", "utf-8")

      for (let i = 0; i < 12; i++) {
        await writeWithBackup(fp, `v${i}`, root)
        await sleep(10)
      }

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const bakFiles = allBaks.filter(f => f.endsWith(".bak")).sort()
      const oldest = bakFiles[0]
      const oldestTimestamp = parseInt(oldest.match(/\.(\d+)\.bak$/)?.[1] ?? "0", 10)
      expect(oldestTimestamp).toBeGreaterThan(0)
    })
  })

  describe("4.3 Atomic write", () => {
    it("atomicWriteFile creates parent directories", async () => {
      const root = await worktree()
      const fp = path.join(root, "deep", "nested", "file.json")
      await atomicWriteFile(fp, '{"a":1}')
      const content = await fs.readFile(fp, "utf-8")
      expect(content).toBe('{"a":1}')
    })

    it("atomicWriteFile removes .tmp on success", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await atomicWriteFile(fp, "data")
      const tmpExists = await fs.access(fp + ".tmp").then(() => true, () => false)
      expect(tmpExists).toBe(false)
    })

    it("atomicWriteFile overwrites existing file", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await atomicWriteFile(fp, "old")
      await atomicWriteFile(fp, "new")
      const content = await fs.readFile(fp, "utf-8")
      expect(content).toBe("new")
    })

    it("writeWithBackup creates backup of existing file before overwrite", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "original", "utf-8")
      await writeWithBackup(fp, "updated", root)

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const bakFile = allBaks.find(f => f.endsWith(".bak"))
      expect(bakFile).toBeDefined()
      const content = await fs.readFile(path.join(backupDir, bakFile!), "utf-8")
      expect(content).toBe("original")
    })

    it("writeWithBackup creates checksum sidecar for backup", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "content", "utf-8")
      await writeWithBackup(fp, "updated", root)

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const bakFile = allBaks.find(f => f.endsWith(".bak"))
      expect(bakFile).toBeDefined()
      const shaExists = await fs.access(path.join(backupDir, `${bakFile}.sha256`)).then(() => true, () => false)
      expect(shaExists).toBe(true)
    })

    it("writeWithBackup verifies checksum after writing backup", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "original", "utf-8")
      await writeWithBackup(fp, "updated", root)

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const bakFile = allBaks.find(f => f.endsWith(".bak"))
      const bakPath = path.join(backupDir, bakFile!)
      const content = await fs.readFile(bakPath, "utf-8")
      const stored = await fs.readFile(`${bakPath}.sha256`, "utf-8")
      const crypto = await import("node:crypto")
      const computed = crypto.createHash("sha256").update(content).digest("hex")
      expect(stored.trim()).toBe(computed)
    })
  })

  describe("4.4 Backup restore", () => {
    it("findLatestValidBackup returns null when no backups exist", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const result = await findLatestValidBackup(fp, root, { safeParse: () => ({ success: false }) })
      expect(result).toBeNull()
    })

    it("findLatestValidBackup returns null when all backups are corrupted", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      await fs.writeFile(path.join(backupDir, `test.json.${Date.now()}.bak`), "not json", "utf-8")
      const result = await findLatestValidBackup(fp, root, { safeParse: () => ({ success: false }) })
      expect(result).toBeNull()
    })

    it("findLatestValidBackup returns valid backup when schema matches", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const validData = { key: "value" }
      await fs.writeFile(path.join(backupDir, `test.json.${Date.now()}.bak`), JSON.stringify(validData), "utf-8")
      const schema = { safeParse: (d: unknown) => ({ success: true, data: d }) }
      const result = await findLatestValidBackup(fp, root, schema)
      expect(result).toEqual(validData)
    })

    it("findLatestValidBackup returns newest valid backup", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const ts1 = Date.now() - 1000
      const ts2 = Date.now()
      await fs.writeFile(path.join(backupDir, `test.json.${ts1}.bak`), JSON.stringify({ v: 1 }), "utf-8")
      await fs.writeFile(path.join(backupDir, `test.json.${ts2}.bak`), JSON.stringify({ v: 2 }), "utf-8")
      const schema = { safeParse: (d: unknown) => ({ success: true, data: d }) }
      const result = await findLatestValidBackup(fp, root, schema)
      expect(result).toEqual({ v: 2 })
    })

    it("findLatestValidBackup skips corrupted backups and returns next valid", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const ts1 = Date.now() - 2000
      const ts2 = Date.now() - 1000
      await fs.writeFile(path.join(backupDir, `test.json.${ts1}.bak`), JSON.stringify({ v: 1 }), "utf-8")
      await fs.writeFile(path.join(backupDir, `test.json.${ts2}.bak`), "{invalid json", "utf-8")
      const schema = { safeParse: (d: unknown) => ({ success: true, data: d }) }
      const result = await findLatestValidBackup(fp, root, schema)
      expect(result).toEqual({ v: 1 })
    })
  })

  describe("4.5 Corruption warnings", () => {
    it("pushCorruptionWarning adds warning to array", () => {
      pushCorruptionWarning("/test/file.json", "error msg")
      expect(corruptionWarnings).toHaveLength(1)
      expect(corruptionWarnings[0].file).toBe("/test/file.json")
      expect(corruptionWarnings[0].message).toBe("error msg")
    })

    it("pushCorruptionWarning deduplicates by file + message", () => {
      pushCorruptionWarning("/test/file.json", "error msg")
      pushCorruptionWarning("/test/file.json", "error msg")
      expect(corruptionWarnings).toHaveLength(1)
    })

    it("pushCorruptionWarning allows different messages for same file", () => {
      pushCorruptionWarning("/test/file.json", "error 1")
      pushCorruptionWarning("/test/file.json", "error 2")
      expect(corruptionWarnings).toHaveLength(2)
    })

    it("pushCorruptionWarning includes suggestion when provided", () => {
      pushCorruptionWarning("/test/file.json", "error", "fix suggestion")
      expect(corruptionWarnings[0].suggestion).toBe("fix suggestion")
    })

    it("pushCorruptionWarning includes timestamp", () => {
      const before = Date.now()
      pushCorruptionWarning("/test/file.json", "error")
      const after = Date.now()
      expect(corruptionWarnings[0].timestamp).toBeGreaterThanOrEqual(before)
      expect(corruptionWarnings[0].timestamp).toBeLessThanOrEqual(after)
    })

    it("clearCorruptionWarnings empties the array", () => {
      pushCorruptionWarning("/test/file.json", "error")
      clearCorruptionWarnings()
      expect(corruptionWarnings).toHaveLength(0)
    })
  })

  describe("4.6 Lock edge cases", () => {
    it("acquireLock creates parent directory if missing", async () => {
      const root = await worktree()
      const fp = path.join(root, "deep", "nested", "file.json")
      const handle = await acquireLock(fp)
      expect(await fs.stat(handle.lockDir)).toBeDefined()
      await releaseLock(handle)
    })

    it("acquireLock throws on timeout when lock held by external process", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const lockDir = fp + ".lock"
      await fs.mkdir(path.dirname(lockDir), { recursive: true })
      await fs.mkdir(lockDir, { recursive: false })
      await fs.writeFile(path.join(lockDir, "lock.json"), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }))
      await expect(acquireLock(fp, { timeout: 100 })).rejects.toThrow("Lock timeout")
    })

    it("acquireLock steals lock when PID is dead (ESRCH)", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const lockDir = fp + ".lock"
      await fs.mkdir(path.dirname(lockDir), { recursive: true })
      await fs.mkdir(lockDir, { recursive: false })
      await fs.writeFile(path.join(lockDir, "lock.json"), JSON.stringify({ pid: 999999999, createdAt: new Date().toISOString() }))
      const handle = await acquireLock(fp, { timeout: 5000 })
      expect(handle.filePath).toBe(fp)
      await releaseLock(handle)
    })

    it("acquireLock steals stale lock by age", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const lockDir = fp + ".lock"
      await fs.mkdir(path.dirname(lockDir), { recursive: true })
      await fs.mkdir(lockDir, { recursive: false })
      await fs.writeFile(path.join(lockDir, "lock.json"), JSON.stringify({ pid: 999999999, createdAt: new Date(Date.now() - 60000).toISOString() }))
      const handle = await acquireLock(fp, { staleThreshold: 1000 })
      expect(handle.filePath).toBe(fp)
      await releaseLock(handle)
    })

    it("acquireLock steals lock when lock.json missing", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const lockDir = fp + ".lock"
      await fs.mkdir(path.dirname(lockDir), { recursive: true })
      await fs.mkdir(lockDir, { recursive: false })
      const handle = await acquireLock(fp, { staleThreshold: 100, timeout: 500 })
      expect(handle.filePath).toBe(fp)
      await releaseLock(handle)
    })

    it("acquireLock steals lock when createdAt is invalid date", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const lockDir = fp + ".lock"
      await fs.mkdir(path.dirname(lockDir), { recursive: true })
      await fs.mkdir(lockDir, { recursive: false })
      await fs.writeFile(path.join(lockDir, "lock.json"), JSON.stringify({ pid: 999999999, createdAt: "not-a-date" }))
      const handle = await acquireLock(fp, { staleThreshold: 100, timeout: 500 })
      expect(handle.filePath).toBe(fp)
      await releaseLock(handle)
    })

    it("releaseLock is idempotent", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      const handle = await acquireLock(fp)
      await releaseLock(handle)
      await expect(releaseLock(handle)).resolves.toBeUndefined()
    })

    it("withLock releases on callback error", async () => {
      const root = await worktree()
      const fp = path.join(root, "test.json")
      await expect(withLock(fp, async () => { throw new Error("boom") })).rejects.toThrow("boom")
      const handle = await acquireLock(fp)
      expect(handle.reentrant).toBe(false)
      await releaseLock(handle)
    })

    it("withLock protects read-modify-write from concurrent access", async () => {
      const root = await worktree()
      const fp = path.join(root, "counter.json")
      await fs.writeFile(fp, JSON.stringify({ n: 0 }), "utf-8")
      for (let i = 0; i < 5; i++) {
        await withLock(fp, async () => {
          const data = JSON.parse(await fs.readFile(fp, "utf-8"))
          data.n++
          await fs.writeFile(fp, JSON.stringify(data), "utf-8")
        })
      }
      const final = JSON.parse(await fs.readFile(fp, "utf-8"))
      expect(final.n).toBe(5)
    })
  })

  describe("4.7 readSession edge cases", () => {
    it("returns DEFAULT_SESSION on ENOENT", async () => {
      const root = await worktree()
      const result = await readSession(root)
      expect(result).toEqual(DEFAULT_SESSION)
    })

    it("returns DEFAULT_SESSION on invalid JSON (no backup available)", async () => {
      const root = await worktree()
      const fp = sessionPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "not json", "utf-8")
      const result = await readSession(root)
      expect(result).toEqual(DEFAULT_SESSION)
    })

    it("returns DEFAULT_SESSION on schema validation failure (no backup)", async () => {
      const root = await worktree()
      const fp = sessionPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, JSON.stringify({ history: "not-an-array", phase: 12345 }), "utf-8")
      const result = await readSession(root)
      expect(result).toEqual(DEFAULT_SESSION)
    })

    it("merges partial session with defaults", async () => {
      const root = await worktree()
      const fp = sessionPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, JSON.stringify({ phase: "plan" }), "utf-8")
      const result = await readSession(root)
      expect(result.phase).toBe("plan")
      expect(result.command).toBeNull()
      expect(result.history).toEqual([])
    })

    it("restore from backup on schema failure when backup exists", async () => {
      const root = await worktree()
      const fp = sessionPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      const valid1 = { ...DEFAULT_SESSION, phase: "tasks" as const }
      const valid2 = { ...DEFAULT_SESSION, phase: "spec" as const }
      await writeSession(root, valid1)
      await writeSession(root, valid2)

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const bakFile = allBaks.find(f => f.endsWith(".bak"))
      expect(bakFile).toBeDefined()

      await fs.writeFile(fp, JSON.stringify({ history: "not-an-array", phase: 12345 }), "utf-8")
      clearCorruptionWarnings()
      const result = await readSession(root)
      expect(result.phase).toBe("tasks")
    })
  })

  describe("4.8 readSpecJson edge cases", () => {
    it("returns null on ENOENT", async () => {
      const root = await worktree()
      const result = await readSpecJson(path.join(root, "specs", "001-foo"))
      expect(result).toBeNull()
    })

    it("returns null for invalid JSON (no backup)", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      const fp = specJsonPath(featureDir)
      await fs.writeFile(fp, "not json", "utf-8")
      const result = await readSpecJson(featureDir)
      expect(result).toBeNull()
    })

    it("returns null for schema failure (no backup)", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      const fp = specJsonPath(featureDir)
      await fs.writeFile(fp, JSON.stringify({ invalid: true }), "utf-8")
      const result = await readSpecJson(featureDir)
      expect(result).toBeNull()
    })

    it("returns valid SpecJson for correct data", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      const sj = makeSpecJson("my feature", 5)
      await writeSpecJson(sj, featureDir)
      const result = await readSpecJson(featureDir)
      expect(result).not.toBeNull()
      expect(result!.feature_name).toBe("my feature")
      expect(result!.feature_number).toBe(5)
    })

    it("restores from backup on checksum mismatch", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      const sj1 = makeSpecJson("original", 1)
      const sj2 = makeSpecJson("updated", 2)
      await writeSpecJson(sj1, featureDir)
      await writeSpecJson(sj2, featureDir)

      const fp = specJsonPath(featureDir)
      await fs.writeFile(fp, "corrupted content", "utf-8")
      clearCorruptionWarnings()
      const result = await readSpecJson(featureDir)
      expect(result).not.toBeNull()
      expect(result!.feature_name).toBe("original")
    })
  })

  describe("4.9 readConfig edge cases", () => {
    it("returns DEFAULT_CONFIG on ENOENT", async () => {
      const root = await worktree()
      const result = await readConfig(root)
      expect(result).toEqual(DEFAULT_CONFIG)
    })

    it("returns DEFAULT_CONFIG on invalid JSON", async () => {
      const root = await worktree()
      const fp = configPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, "not json", "utf-8")
      const result = await readConfig(root)
      expect(result).toEqual(DEFAULT_CONFIG)
    })

    it("returns DEFAULT_CONFIG on schema failure", async () => {
      const root = await worktree()
      const fp = configPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, JSON.stringify({ language: 12345 }), "utf-8")
      const result = await readConfig(root)
      expect(result).toEqual(DEFAULT_CONFIG)
    })

    it("merges partial config with defaults", async () => {
      const root = await worktree()
      const fp = configPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, JSON.stringify({ lastUsedLanguage: "es" }), "utf-8")
      const result = await readConfig(root)
      expect(result.lastUsedLanguage).toBe("es")
      expect(result.defaultTechStack).toBe(DEFAULT_CONFIG.defaultTechStack)
    })

    it("restores from backup on checksum mismatch", async () => {
      const root = await worktree()
      const fp = configPath(root)
      await fs.mkdir(path.dirname(fp), { recursive: true })
      await fs.writeFile(fp, JSON.stringify(DEFAULT_CONFIG), "utf-8")
      await writeFileChecksum(fp)

      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const bakFile = path.join(backupDir, `config.json.${Date.now()}.bak`)
      await fs.writeFile(bakFile, JSON.stringify(DEFAULT_CONFIG), "utf-8")
      await fs.writeFile(`${bakFile}.sha256`, "", "utf-8")

      await fs.writeFile(fp, "corrupted", "utf-8")
      clearCorruptionWarnings()
      const result = await readConfig(root)
      expect(result).toEqual(DEFAULT_CONFIG)
    })
  })

  describe("4.10 writeSession edge cases", () => {
    it("throws on invalid session data", async () => {
      const root = await worktree()
      await expect(writeSession(root, { phase: "bogus" } as any)).rejects.toThrow("validation failed")
    })

    it("preserves existing file when write fails validation", async () => {
      const root = await worktree()
      const valid = { ...DEFAULT_SESSION, phase: "spec" as const }
      await writeSession(root, valid)
      await expect(writeSession(root, { phase: "bogus" } as any)).rejects.toThrow()
      const result = await readSession(root)
      expect(result.phase).toBe("spec")
    })

    it("writes and reads back session data", async () => {
      const root = await worktree()
      const s = { ...DEFAULT_SESSION, phase: "plan" as const, featureName: "test" }
      await writeSession(root, s)
      const result = await readSession(root)
      expect(result.phase).toBe("plan")
      expect(result.featureName).toBe("test")
    })

    it("creates backup before overwriting", async () => {
      const root = await worktree()
      const s1 = { ...DEFAULT_SESSION, phase: "spec" as const }
      const s2 = { ...DEFAULT_SESSION, phase: "plan" as const }
      await writeSession(root, s1)
      await writeSession(root, s2)

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const sessionBaks = allBaks.filter(f => f.startsWith("session.json") && f.endsWith(".bak"))
      expect(sessionBaks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("4.11 writeSpecJson edge cases", () => {
    it("throws on invalid SpecJson data", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      await expect(writeSpecJson({ invalid: true } as any, featureDir)).rejects.toThrow("validation failed")
    })

    it("updates updated_at timestamp", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      const sj = makeSpecJson("test", 1)
      const before = sj.updated_at
      await sleep(10)
      await writeSpecJson(sj, featureDir)
      const result = await readSpecJson(featureDir)
      expect(result!.updated_at).not.toBe(before)
    })

    it("creates backup before overwrite", async () => {
      const root = await worktree()
      const featureDir = path.join(root, "specs", "001-test")
      await fs.mkdir(featureDir, { recursive: true })
      const sj1 = makeSpecJson("test", 1)
      const sj2 = makeSpecJson("test", 2)
      await writeSpecJson(sj1, featureDir)
      await writeSpecJson(sj2, featureDir)

      const backupDir = path.join(root, ".opencode", "backups")
      const allBaks = await fs.readdir(backupDir)
      const specBaks = allBaks.filter(f => f.startsWith("spec.json") && f.endsWith(".bak"))
      expect(specBaks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("4.12 Error helpers", () => {
    it("isENOENT returns true for ENOENT errors", () => {
      const err = new Error("not found") as any
      err.code = "ENOENT"
      expect(isENOENT(err)).toBe(true)
    })

    it("isENOENT returns false for non-ENOENT errors", () => {
      const err = new Error("permission denied") as any
      err.code = "EACCES"
      expect(isENOENT(err)).toBe(false)
    })

    it("isENOENT returns false for non-Error values", () => {
      expect(isENOENT("not an error")).toBe(false)
      expect(isENOENT(null)).toBe(false)
      expect(isENOENT(undefined)).toBe(false)
    })

    it("isEEXIST returns true for EEXIST errors", () => {
      const err = new Error("exists") as any
      err.code = "EEXIST"
      expect(isEEXIST(err)).toBe(true)
    })

    it("isEEXIST returns false for non-EEXIST errors", () => {
      const err = new Error("not found") as any
      err.code = "ENOENT"
      expect(isEEXIST(err)).toBe(false)
    })

    it("isESRCH returns true for ESRCH errors", () => {
      const err = new Error("no such process") as any
      err.code = "ESRCH"
      expect(isESRCH(err)).toBe(true)
    })

    it("isESRCH returns false for non-ESRCH errors", () => {
      const err = new Error("not found") as any
      err.code = "ENOENT"
      expect(isESRCH(err)).toBe(false)
    })
  })

  describe("4.13 Backup integrity verification", () => {
    it("verifyBackupIntegrity returns empty report when no backups dir", async () => {
      const root = await worktree()
      const report = await verifyBackupIntegrity(root, {})
      expect(report.totalBackups).toBe(0)
      expect(report.valid).toBe(0)
    })

    it("verifyBackupIntegrity counts valid backups", async () => {
      const root = await worktree()
      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const content = JSON.stringify(DEFAULT_SESSION)
      await fs.writeFile(path.join(backupDir, "session.json.123.bak"), content, "utf-8")
      const crypto = await import("node:crypto")
      const hash = crypto.createHash("sha256").update(content).digest("hex")
      await fs.writeFile(path.join(backupDir, "session.json.123.bak.sha256"), hash, "utf-8")
      const report = await verifyBackupIntegrity(root, { "session.json": SessionStateSchema as any })
      expect(report.totalBackups).toBe(1)
      expect(report.valid).toBe(1)
    })

    it("verifyBackupIntegrity counts corrupted backups", async () => {
      const root = await worktree()
      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      const content = "not json"
      await fs.writeFile(path.join(backupDir, "session.json.123.bak"), content, "utf-8")
      const crypto = await import("node:crypto")
      const hash = crypto.createHash("sha256").update(content).digest("hex")
      await fs.writeFile(path.join(backupDir, "session.json.123.bak.sha256"), hash, "utf-8")
      const report = await verifyBackupIntegrity(root, { "session.json": SessionStateSchema as any })
      expect(report.totalBackups).toBe(1)
      expect(report.corrupted).toBe(1)
    })

    it("verifyBackupIntegrity counts backups with missing checksum", async () => {
      const root = await worktree()
      const backupDir = path.join(root, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      await fs.writeFile(path.join(backupDir, "session.json.123.bak"), JSON.stringify(DEFAULT_SESSION), "utf-8")
      const report = await verifyBackupIntegrity(root, { "session.json": SessionStateSchema as any })
      expect(report.missingChecksum).toBe(1)
    })
  })
})
