import path from "node:path"
import fs from "node:fs/promises"
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
      await fs.mkdir(path.dirname(lockDir), { recursive: true })
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

const BACKUP_DIR_NAME = ".opencode/backups"
const MAX_BACKUPS = 10

export async function writeWithBackup(fp: string, data: string): Promise<void> {
  const existing = await fs.readFile(fp, "utf-8").catch(() => null)
  if (existing !== null) {
    const backupDir = path.join(path.dirname(fp), BACKUP_DIR_NAME)
    const timestamp = Date.now()
    const bakFile = path.join(backupDir, `${path.basename(fp)}.${timestamp}.bak`)
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(bakFile, existing, "utf-8")
    const allBaks = await fs.readdir(backupDir).catch(() => [])
    if (allBaks.length > MAX_BACKUPS) {
      const sorted = allBaks.sort()
      for (const old of sorted.slice(0, allBaks.length - MAX_BACKUPS)) {
        await fs.rm(path.join(backupDir, old), { force: true })
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

// ─────────────────────────── Corruption Warnings ───────────────────────────

export interface CorruptionWarning {
  file: string
  message: string
  timestamp: number
}

export let corruptionWarnings: CorruptionWarning[] = []

export function clearCorruptionWarnings(): void {
  corruptionWarnings = []
}

export function pushCorruptionWarning(fp: string, errorMsg: string): void {
  const warn: CorruptionWarning = { file: fp, message: errorMsg, timestamp: Date.now() }
  corruptionWarnings.push(warn)
  console.warn(`[SDD] Corruption detected in ${fp}: using defaults. ${errorMsg}`)
}

// ─────────────────────────── Session I/O ───────────────────────────

export async function readSession(root: string): Promise<SessionState> {
  try {
    const fp = sessionPath(root)
    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const merged = { ...DEFAULT_SESSION, ...parsed }
    const result = SessionStateSchema.safeParse(merged)
    if (result.success) {
      return result.data
    }
    pushCorruptionWarning(fp, result.error.message)
    return { ...DEFAULT_SESSION }
  } catch (err) {
    const fp = sessionPath(root)
    if (!isENOENT(err)) {
      const msg = err instanceof Error ? err.message : String(err)
      pushCorruptionWarning(fp, msg)
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
    await writeWithBackup(fp, JSON.stringify(result.data, null, 2))
  } finally {
    await releaseLock(handle)
  }
  await tryAutoCommit(fp, root)
}

// ─────────────────────────── SpecJson I/O ───────────────────────────

export async function readSpecJson(featureDir: string): Promise<SpecJson | null> {
  try {
    const fp = specJsonPath(featureDir)
    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const result = SpecJsonSchema.safeParse(parsed)
    if (result.success) {
      return result.data
    }
    pushCorruptionWarning(fp, result.error.message)
    return null
  } catch (err) {
    const fp = specJsonPath(featureDir)
    if (!isENOENT(err)) {
      const msg = err instanceof Error ? err.message : String(err)
      pushCorruptionWarning(fp, msg)
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
  const fp = specJsonPath(featureDir)
  const handle = await acquireLock(fp)
  try {
    await writeWithBackup(fp, JSON.stringify(result.data, null, 2))
  } finally {
    await releaseLock(handle)
  }
  const root = path.dirname(path.dirname(featureDir))
  await tryAutoCommit(fp, root)
}

// ─────────────────────────── Config I/O ───────────────────────────

export async function readConfig(root: string): Promise<SDDConfig> {
  const fp = configPath(root)
  try {
    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const merged = { ...DEFAULT_CONFIG, ...parsed }
    const result = ConfigSchema.safeParse(merged)
    if (result.success) return result.data
    pushCorruptionWarning(fp, result.error.message)
    return { ...DEFAULT_CONFIG }
  } catch (err) {
    if (!isENOENT(err)) {
      const msg = err instanceof Error ? err.message : String(err)
      pushCorruptionWarning(fp, msg)
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
