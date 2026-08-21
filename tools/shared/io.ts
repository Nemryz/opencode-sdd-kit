import path from "node:path"
import fs from "node:fs/promises"
import crypto from "node:crypto"
import {
  sessionPath,
  specJsonPath,
  configPath,
  SessionState,
  SpecJson,
  SDDConfig,
  SessionStateSchema,
  SpecJsonSchema,
  ConfigSchema,
  DEFAULT_SESSION,
  DEFAULT_CONFIG,
} from "./schemas"

// ─────────────────────────── Error helpers ───────────────────────────

interface ErrorWithCode extends Error {
  code: string
}

function isErrorWithCode(err: unknown): err is ErrorWithCode {
  return err instanceof Error && typeof (err as ErrorWithCode).code === "string"
}

export function isENOENT(err: unknown): boolean {
  return isErrorWithCode(err) && err.code === "ENOENT"
}

export function isEEXIST(err: unknown): boolean {
  return isErrorWithCode(err) && err.code === "EEXIST"
}

export function isESRCH(err: unknown): boolean {
  return isErrorWithCode(err) && err.code === "ESRCH"
}

// ─────────────────────────── Checksum helpers ───────────────────────────

function computeSha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex")
}

async function writeChecksumFile(bakPath: string, data: string): Promise<void> {
  const hash = computeSha256(data)
  await fs.writeFile(`${bakPath}.sha256`, hash, "utf-8")
}

async function verifyChecksum(bakPath: string, data: string): Promise<boolean> {
  try {
    const stored = await fs.readFile(`${bakPath}.sha256`, "utf-8")
    const computed = computeSha256(data)
    return stored.trim() === computed
  } catch {
    return false
  }
}

async function verifyFileChecksum(fp: string): Promise<boolean> {
  try {
    const checksumPath = `${fp}.sha256`
    const stored = await fs.readFile(checksumPath, "utf-8")
    const data = await fs.readFile(fp, "utf-8")
    const computed = computeSha256(data)
    return stored.trim() === computed
  } catch {
    return true
  }
}

// ─────────────────────────── File Locking ───────────────────────────

export interface LockOptions {
  timeout?: number
  staleThreshold?: number
}

export interface LockHandle {
  lockDir: string
  filePath: string
  reentrant?: boolean
}

const heldLocks = new Set<string>()

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function readLockJson(lockDir: string): Promise<{ pid: number; createdAt: string } | null> {
  try {
    const data = await fs.readFile(path.join(lockDir, "lock.json"), "utf-8")
    return JSON.parse(data)
  } catch {
    return null
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if (isESRCH(err)) {
      return false
    }
    return true
  }
}

export async function acquireLock(filePath: string, options?: LockOptions): Promise<LockHandle> {
  const lockDir = filePath + ".lock"
  if (heldLocks.has(lockDir)) {
    return { lockDir, filePath, reentrant: true }
  }
  const timeout = options?.timeout ?? 5000
  const staleThreshold = options?.staleThreshold ?? 10000
  const start = Date.now()

  while (true) {
    try {
      const parentDir = path.dirname(lockDir)
      try {
        await fs.access(parentDir)
      } catch {
        await fs.mkdir(parentDir, { recursive: true })
      }
      await fs.mkdir(lockDir, { recursive: false })
      await fs.writeFile(
        path.join(lockDir, "lock.json"),
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        "utf-8",
      )
      heldLocks.add(lockDir)
      return { lockDir, filePath, reentrant: false }
    } catch (err) {
      if (isEEXIST(err)) {
        const info = await readLockJson(lockDir)
        if (info && info.pid !== process.pid && !isPidAlive(info.pid)) {
          await fs.rm(lockDir, { recursive: true, force: true })
          continue
        }
        const createdAt = info ? new Date(info.createdAt).getTime() : NaN
        if (!info || isNaN(createdAt) || (Date.now() - createdAt > staleThreshold)) {
          await fs.rm(lockDir, { recursive: true, force: true })
          continue
        }
        if (Date.now() - start >= timeout) {
          throw new Error(`Lock timeout: could not acquire lock for ${filePath}`)
        }
        await sleep(50)
        continue
      }
      throw err
    }
  }
}

export async function releaseLock(handle: LockHandle): Promise<void> {
  if (handle.reentrant) return
  heldLocks.delete(handle.lockDir)
  try {
    await fs.rm(handle.lockDir, { recursive: true, force: true })
  } catch {
    // idempotent
  }
}

export function resetLocks(): void {
  heldLocks.clear()
}

export async function withLock<T>(filePath: string, fn: () => Promise<T>, options?: LockOptions): Promise<T> {
  const handle = await acquireLock(filePath, options)
  try {
    return await fn()
  } finally {
    await releaseLock(handle)
  }
}

// ─────────────────────────── Atomic file write ───────────────────────────

const BACKUP_DIR_NAME = "backups"
const MAX_BACKUPS = 10

export async function writeWithBackup(fp: string, data: string, root: string): Promise<void> {
  const existing = await fs.readFile(fp, "utf-8").catch(() => null)
  if (existing !== null) {
    const backupDir = path.join(root, ".opencode", BACKUP_DIR_NAME)
    const timestamp = Date.now()
    const bakFile = path.join(backupDir, `${path.basename(fp)}.${timestamp}.bak`)
    await fs.mkdir(backupDir, { recursive: true })
    
    await fs.writeFile(bakFile, existing, "utf-8")
    await writeChecksumFile(bakFile, existing)
    
    const verified = await verifyChecksum(bakFile, existing)
    if (!verified) {
      await fs.rm(bakFile, { force: true })
      await fs.rm(`${bakFile}.sha256`, { force: true })
      throw new Error(`Backup verification failed for ${fp}`)
    }
    
    const allBaks = await fs.readdir(backupDir).catch(() => [])
    const bakFiles = allBaks.filter(f => f.endsWith(".bak"))
    if (bakFiles.length > MAX_BACKUPS) {
      const sorted = bakFiles.sort()
      for (const old of sorted.slice(0, bakFiles.length - MAX_BACKUPS)) {
        await fs.rm(path.join(backupDir, old), { force: true })
        await fs.rm(path.join(backupDir, `${old}.sha256`), { force: true })
      }
    }
  }
  await atomicWriteFile(fp, data)
}

export async function atomicWriteFile(fp: string, data: string): Promise<void> {
  const tmp = fp + ".tmp"
  const dir = path.dirname(fp)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(tmp, data, "utf-8")
  try {
    await fs.rename(tmp, fp)
  } catch {
    await fs.rm(tmp, { force: true })
    throw new Error(`atomicWriteFile: rename failed for ${fp}`)
  }
}

// ─────────────────────────── Backup Restore ───────────────────────────

export async function findLatestValidBackup<T>(
  fp: string,
  root: string,
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T } },
): Promise<T | null> {
  const backupDir = path.join(root, ".opencode", BACKUP_DIR_NAME)
  const basename = path.basename(fp)

  let files: string[]
  try {
    files = await fs.readdir(backupDir)
  } catch {
    return null
  }

  const backups = files
    .filter(f => f.startsWith(basename) && f.endsWith(".bak"))
    .sort()
    .reverse()

  for (const bak of backups) {
    try {
      const content = await fs.readFile(path.join(backupDir, bak), "utf-8")
      const parsed = JSON.parse(content)
      const result = schema.safeParse(parsed)
      if (result.success) {
        return result.data as T
      }
    } catch {
      continue
    }
  }
  return null
}

// ─────────────────────────── Backup Integrity Verification ───────────────────────────

export interface BackupIntegrityReport {
  totalBackups: number
  valid: number
  corrupted: number
  missingChecksum: number
  details: Array<{
    file: string
    status: "valid" | "corrupted" | "missing-checksum" | "read-error"
    error?: string
  }>
}

export async function verifyBackupIntegrity(
  root: string,
  schemas: Record<string, { safeParse: (data: unknown) => { success: boolean } }>,
): Promise<BackupIntegrityReport> {
  const backupDir = path.join(root, ".opencode", BACKUP_DIR_NAME)
  const report: BackupIntegrityReport = {
    totalBackups: 0,
    valid: 0,
    corrupted: 0,
    missingChecksum: 0,
    details: [],
  }

  let files: string[]
  try {
    files = await fs.readdir(backupDir)
  } catch {
    return report
  }

  const bakFiles = files.filter(f => f.endsWith(".bak"))
  report.totalBackups = bakFiles.length

  for (const bak of bakFiles) {
    const bakPath = path.join(backupDir, bak)
    try {
      const content = await fs.readFile(bakPath, "utf-8")
      
      const checksumValid = await verifyChecksum(bakPath, content)
      if (!checksumValid) {
        report.missingChecksum++
        report.details.push({ file: bak, status: "missing-checksum" })
        continue
      }

      const basename = bak.replace(/\.\d+\.bak$/, "")
      const schema = schemas[basename]
      if (schema) {
        const parsed = JSON.parse(content)
        if (schema.safeParse(parsed).success) {
          report.valid++
          report.details.push({ file: bak, status: "valid" })
        } else {
          report.corrupted++
          report.details.push({ file: bak, status: "corrupted" })
        }
      } else {
        report.valid++
        report.details.push({ file: bak, status: "valid" })
      }
    } catch (err) {
      report.corrupted++
      report.details.push({
        file: bak,
        status: "read-error",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return report
}

// ─────────────────────────── Corruption Warnings ───────────────────────────

export interface CorruptionWarning {
  file: string
  message: string
  timestamp: number
  suggestion?: string
}

export let corruptionWarnings: CorruptionWarning[] = []

export function clearCorruptionWarnings(): void {
  corruptionWarnings = []
}

export function pushCorruptionWarning(fp: string, errorMsg: string, suggestion?: string): void {
  const existing = corruptionWarnings.find(w => w.file === fp && w.message === errorMsg)
  if (existing) return
  const warn: CorruptionWarning = { file: fp, message: errorMsg, timestamp: Date.now(), suggestion }
  corruptionWarnings.push(warn)
  console.warn(`[SDD] Corruption detected in ${fp}: using defaults. ${errorMsg}`)
  if (suggestion) {
    console.warn(`[SDD] ${suggestion}`)
  }
}

// ─────────────────────────── Session I/O ───────────────────────────

export async function readSession(root: string): Promise<SessionState> {
  const fp = sessionPath(root)
  try {
    const checksumValid = await verifyFileChecksum(fp)
    if (!checksumValid) {
      pushCorruptionWarning(fp, "checksum mismatch, file may be corrupted")
      const restored = await findLatestValidBackup<SessionState>(fp, root, SessionStateSchema)
      if (restored) {
        console.warn(`[SDD] Restored ${fp} from backup (checksum mismatch)`)
        return restored
      }
      return { ...DEFAULT_SESSION }
    }
    
    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const merged = { ...DEFAULT_SESSION, ...parsed }
    const result = SessionStateSchema.safeParse(merged)
    if (result.success) {
      return result.data
    }
    pushCorruptionWarning(fp, result.error.message)
    const restored = await findLatestValidBackup<SessionState>(fp, root, SessionStateSchema)
    if (restored) {
      console.warn(`[SDD] Restored ${fp} from backup`)
      return restored
    }
    return { ...DEFAULT_SESSION }
  } catch (err) {
    if (!isENOENT(err)) {
      const msg = err instanceof Error ? err.message : String(err)
      pushCorruptionWarning(fp, msg)
      const restored = await findLatestValidBackup<SessionState>(fp, root, SessionStateSchema)
      if (restored) {
        console.warn(`[SDD] Restored ${fp} from backup`)
        return restored
      }
    }
    return { ...DEFAULT_SESSION }
  }
}

export async function writeSession(root: string, s: SessionState): Promise<void> {
  const result = SessionStateSchema.safeParse(s)
  if (!result.success) {
    throw new Error(`writeSession: validation failed, data not written: ${String(result.error)}`)
  }
  const fp = sessionPath(root)
  const handle = await acquireLock(fp)
  try {
    await writeWithBackup(fp, JSON.stringify(result.data, null, 2), root)
    
    const written = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(written)
    const verify = SessionStateSchema.safeParse(parsed)
    if (!verify.success) {
      throw new Error(`writeSession: post-write verification failed: ${String(verify.error)}`)
    }
    
    const checksumValid = await verifyFileChecksum(fp)
    if (!checksumValid) {
      throw new Error(`writeSession: post-write checksum verification failed`)
    }
  } finally {
    await releaseLock(handle)
  }
  await tryAutoCommit(fp, root)
}

// ─────────────────────────── SpecJson I/O ───────────────────────────

export async function readSpecJson(featureDir: string): Promise<SpecJson | null> {
  const fp = specJsonPath(featureDir)
  const root = path.dirname(path.dirname(featureDir))
  try {
    const checksumValid = await verifyFileChecksum(fp)
    if (!checksumValid) {
      pushCorruptionWarning(fp, "checksum mismatch, file may be corrupted")
      const restored = await findLatestValidBackup<SpecJson>(fp, root, SpecJsonSchema)
      if (restored) {
        console.warn(`[SDD] Restored ${fp} from backup (checksum mismatch)`)
        return restored
      }
      return null
    }
    
    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const result = SpecJsonSchema.safeParse(parsed)
    if (result.success) {
      return result.data
    }
    pushCorruptionWarning(fp, result.error.message)
    const restored = await findLatestValidBackup<SpecJson>(fp, root, SpecJsonSchema)
    if (restored) {
      console.warn(`[SDD] Restored ${fp} from backup`)
      return restored
    }
    return null
  } catch (err) {
    if (!isENOENT(err)) {
      const msg = err instanceof Error ? err.message : String(err)
      pushCorruptionWarning(fp, msg)
      const restored = await findLatestValidBackup<SpecJson>(fp, root, SpecJsonSchema)
      if (restored) {
        console.warn(`[SDD] Restored ${fp} from backup`)
        return restored
      }
    }
    return null
  }
}

export async function writeSpecJson(sj: SpecJson, featureDir: string): Promise<void> {
  sj.updated_at = new Date().toISOString()
  const result = SpecJsonSchema.safeParse(sj)
  if (!result.success) {
    throw new Error(`writeSpecJson: validation failed, data not written: ${String(result.error)}`)
  }
  const root = path.dirname(path.dirname(featureDir))
  const fp = specJsonPath(featureDir)
  const handle = await acquireLock(fp)
  try {
    await writeWithBackup(fp, JSON.stringify(result.data, null, 2), root)
    
    const written = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(written)
    const verify = SpecJsonSchema.safeParse(parsed)
    if (!verify.success) {
      throw new Error(`writeSpecJson: post-write verification failed: ${String(verify.error)}`)
    }
    
    const checksumValid = await verifyFileChecksum(fp)
    if (!checksumValid) {
      throw new Error(`writeSpecJson: post-write checksum verification failed`)
    }
  } finally {
    await releaseLock(handle)
  }
  await tryAutoCommit(fp, root)
}

// ─────────────────────────── Config I/O ───────────────────────────

export async function readConfig(root: string): Promise<SDDConfig> {
  const fp = configPath(root)
  const configSuggestion = "Run /config to restore your settings"
  try {
    const checksumValid = await verifyFileChecksum(fp)
    if (!checksumValid) {
      pushCorruptionWarning(fp, "checksum mismatch, file may be corrupted", configSuggestion)
      return { ...DEFAULT_CONFIG }
    }
    
    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const merged = { ...DEFAULT_CONFIG, ...parsed }
    const result = ConfigSchema.safeParse(merged)
    if (result.success) return result.data
    pushCorruptionWarning(fp, result.error.message, configSuggestion)
    return { ...DEFAULT_CONFIG }
  } catch (err) {
    if (!isENOENT(err)) {
      const msg = err instanceof Error ? err.message : String(err)
      pushCorruptionWarning(fp, msg, configSuggestion)
    }
    return { ...DEFAULT_CONFIG }
  }
}

// ─────────────────────────── Auto-versioning ───────────────────────────

const AUTO_COMMIT_MESSAGES: Record<string, string> = {
  "session.json": "auto: update session state",
  "spec.json": "auto: update spec state",
  "config.json": "auto: update config",
}

export async function tryAutoCommit(fp: string, root: string): Promise<void> {
  try {
    const gitDir = path.join(root, ".git")
    await fs.access(gitDir)
    const cfg = await readConfig(root)
    if (!cfg.autoVersioning) return
    const basename = path.basename(fp)
    const msg = AUTO_COMMIT_MESSAGES[basename] || `auto: update ${basename}`
    const { execSync } = await import("node:child_process")
    execSync(`git add "${fp}"`, { cwd: root, stdio: "ignore" })
    const diff = execSync(`git diff --cached -- "${fp}"`, { cwd: root, encoding: "utf-8" })
    if (onlyLastUsedLanguageChanged(diff)) {
      execSync(`git checkout HEAD -- "${fp}"`, { cwd: root, stdio: "ignore" })
      return
    }
    execSync(`git commit -m "${msg}"`, { cwd: root, stdio: "ignore" })
  } catch {
    // fail silently
  }
}

function onlyLastUsedLanguageChanged(diff: string): boolean {
  if (!diff) return false
  const lines = diff.split("\n").filter(l => l.startsWith("+") || l.startsWith("-"))
  if (lines.length === 0) return false
  return lines.every(l => l.includes("lastUsedLanguage"))
}
