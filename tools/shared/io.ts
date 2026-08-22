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
  specsDirPath,
  HealthReport,
  FeatureHealth,
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
    await writeFileChecksum(fp)
    
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
    await writeFileChecksum(fp)
    
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

// ─────────────────────────── Frontmatter I/O ───────────────────────────

import matter from "gray-matter"
import { FrontmatterSchema, type FrontmatterData } from "./schemas"

export async function readFrontmatter(filePath: string): Promise<FrontmatterData | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    const parsed = matter(content)
    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      return null
    }
    const result = FrontmatterSchema.safeParse(parsed.data)
    if (!result.success) {
      return null
    }
    return result.data
  } catch {
    try {
      const content = await fs.readFile(filePath, "utf-8")
      const match = content.match(/^---\n([\s\S]*?)\n---/)
      if (match) {
        const lines = match[1].split("\n")
        const recovered: Record<string, unknown> = {}
        for (const line of lines) {
          const kvMatch = line.match(/^(\w+):\s*(.+)$/)
          if (kvMatch) {
            const [, key, rawVal] = kvMatch
            const val = rawVal.trim()
            if (key === "boundaries" || key === "depends_on") continue
            if (val === "true") recovered[key] = true
            else if (val === "false") recovered[key] = false
            else if (/^\d+$/.test(val)) recovered[key] = parseInt(val, 10)
            else recovered[key] = val.replace(/^["']|["']$/g, "")
          }
        }
        const result = FrontmatterSchema.safeParse(recovered)
        if (result.success) return result.data
      }
    } catch { /* ignore */ }
    return null
  }
}

export async function writeFrontmatter(filePath: string, data: FrontmatterData): Promise<void> {
  const content = await fs.readFile(filePath, "utf-8")
  const parsed = matter(content)
  const merged = { ...parsed.data, ...data }
  const output = matter.stringify(parsed.content, merged)
  await atomicWriteFile(filePath, output)
}

export function computeBodyChecksum(content: string): string {
  const parsed = matter(content)
  const normalized = parsed.content.replace(/\r\n/g, "\n").trim()
  return computeSha256(normalized)
}

export async function verifyBodyIntegrity(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    const fm = await readFrontmatter(filePath)
    if (!fm || !fm.checksum) return true
    const bodyChecksum = computeBodyChecksum(content)
    return fm.checksum === bodyChecksum
  } catch {
    return true
  }
}

export async function reconstructFromFrontmatter(featureDir: string): Promise<SpecJson | null> {
  const specPath = path.join(featureDir, "spec.md")
  const planPath = path.join(featureDir, "plan.md")
  const tasksPath = path.join(featureDir, "tasks.md")

  const specFm = await readFrontmatter(specPath)
  const planFm = await readFrontmatter(planPath)
  const tasksFm = await readFrontmatter(tasksPath)

  if (!specFm) return null

  const specOk = specFm.phase !== undefined
  const planOk = planFm?.phase !== undefined
  const tasksOk = tasksFm?.phase !== undefined

  let phase: SpecJson["phase"] = "spec"
  if (tasksOk) phase = "tasks"
  else if (planOk) phase = "plan"
  if (specOk && planOk && tasksOk) phase = "ready"

  if (specFm.phase) phase = specFm.phase

  return {
    feature_name: specFm.feature_name || path.basename(featureDir),
    feature_number: specFm.feature_number || 0,
    created_at: specFm.created_at || new Date().toISOString(),
    updated_at: specFm.updated_at || new Date().toISOString(),
    phase,
    approvals: {
      spec: { generated: specOk, approved: specFm.status === "approved" },
      plan: { generated: planOk, approved: planFm?.status === "approved" },
      tasks: { generated: tasksOk, approved: tasksFm?.status === "approved" },
    },
    ready_for_implementation: phase === "ready",
  }
}

export async function syncFrontmatterFromSpecJson(
  featureDir: string,
  sj: SpecJson,
  extra?: { last_audit?: import("./schemas").AuditMetadata },
): Promise<void> {
  const specPath = path.join(featureDir, "spec.md")
  const planPath = path.join(featureDir, "plan.md")
  const tasksPath = path.join(featureDir, "tasks.md")

  const specExists = await fs.access(specPath).then(() => true).catch(() => false)
  const planExists = await fs.access(planPath).then(() => true).catch(() => false)
  const tasksExists = await fs.access(tasksPath).then(() => true).catch(() => false)

  if (specExists) {
    const existing = await readFrontmatter(specPath)
    await writeFrontmatter(specPath, {
      ...existing,
      feature_name: sj.feature_name,
      feature_number: sj.feature_number,
      created_at: sj.created_at,
      updated_at: sj.updated_at,
      phase: sj.phase,
      status: sj.approvals.spec.approved ? "approved" : sj.approvals.spec.generated ? "validated" : "generated",
      ...(extra?.last_audit ? { last_audit: extra.last_audit } : {}),
    })
  }

  if (planExists) {
    const existing = await readFrontmatter(planPath)
    await writeFrontmatter(planPath, {
      ...existing,
      phase: sj.phase === "plan" || sj.phase === "tasks" || sj.phase === "ready" || sj.phase === "impl" || sj.phase === "complete" ? "plan" : sj.phase,
      status: sj.approvals.plan.approved ? "approved" : sj.approvals.plan.generated ? "validated" : "generated",
      ...(extra?.last_audit ? { last_audit: extra.last_audit } : {}),
    })
  }

  if (tasksExists) {
    const existing = await readFrontmatter(tasksPath)
    await writeFrontmatter(tasksPath, {
      ...existing,
      phase: sj.phase === "tasks" || sj.phase === "ready" || sj.phase === "impl" || sj.phase === "complete" ? "tasks" : sj.phase,
      status: sj.approvals.tasks.approved ? "approved" : sj.approvals.tasks.generated ? "validated" : "generated",
      ...(extra?.last_audit ? { last_audit: extra.last_audit } : {}),
    })
  }
}

// ─────────────────────────── Config Backup I/O ───────────────────────────

export async function writeConfigWithBackup(root: string, cfg: SDDConfig): Promise<void> {
  const result = ConfigSchema.safeParse(cfg)
  if (!result.success) {
    throw new Error(`writeConfigWithBackup: validation failed, data not written: ${String(result.error)}`)
  }
  const fp = configPath(root)
  const handle = await acquireLock(fp)
  try {
    await writeWithBackup(fp, JSON.stringify(result.data, null, 2), root)
    await writeFileChecksum(fp)
  } finally {
    await releaseLock(handle)
  }
  await tryAutoCommit(fp, root)
}

export async function readConfigWithRestore(root: string): Promise<SDDConfig> {
  const fp = configPath(root)
  const configSuggestion = "Run /config to restore your settings"
  try {
    const checksumValid = await verifyLiveFileChecksum(fp)
    if (!checksumValid) {
      pushCorruptionWarning(fp, "checksum mismatch, file may be corrupted", configSuggestion)
      const restored = await findLatestValidBackup<SDDConfig>(fp, root, ConfigSchema)
      if (restored) {
        console.warn(`[SDD] Restored ${fp} from backup (checksum mismatch)`)
        return restored
      }
      return { ...DEFAULT_CONFIG }
    }

    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const merged = { ...DEFAULT_CONFIG, ...parsed }
    const result = ConfigSchema.safeParse(merged)
    if (result.success) return result.data
    pushCorruptionWarning(fp, result.error.message, configSuggestion)
    const restored = await findLatestValidBackup<SDDConfig>(fp, root, ConfigSchema)
    if (restored) {
      console.warn(`[SDD] Restored ${fp} from backup`)
      return restored
    }
    return { ...DEFAULT_CONFIG }
  } catch (err) {
    if (!isENOENT(err)) {
      const msg = err instanceof Error ? err.message : String(err)
      pushCorruptionWarning(fp, msg, configSuggestion)
      const restored = await findLatestValidBackup<SDDConfig>(fp, root, ConfigSchema)
      if (restored) {
        console.warn(`[SDD] Restored ${fp} from backup`)
        return restored
      }
    }
    return { ...DEFAULT_CONFIG }
  }
}

// ─────────────────────────── Live File Checksum ───────────────────────────

export async function writeFileChecksum(fp: string): Promise<void> {
  try {
    const data = await fs.readFile(fp, "utf-8")
    const hash = computeSha256(data)
    await fs.writeFile(`${fp}.sha256`, hash, "utf-8")
  } catch {
    // fail silently
  }
}

export async function verifyLiveFileChecksum(fp: string): Promise<boolean> {
  try {
    await fs.access(fp)
  } catch {
    return false
  }
  try {
    const data = await fs.readFile(fp, "utf-8")
    const stored = await fs.readFile(`${fp}.sha256`, "utf-8")
    const computed = computeSha256(data)
    return stored.trim() === computed
  } catch {
    return true
  }
}

// ─────────────────────────── Frontmatter Checksum ───────────────────────────

export async function writeFrontmatterChecksum(filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    const checksum = computeBodyChecksum(content)
    await writeFrontmatter(filePath, { checksum })
  } catch {
    // fail silently
  }
}

// ─────────────────────────── Health Check ───────────────────────────

export async function runHealthCheck(projectRoot: string): Promise<HealthReport> {
  const report: HealthReport = {
    session: { status: "healthy", file: sessionPath(projectRoot) },
    config: { status: "healthy", file: configPath(projectRoot) },
    features: [],
    overall: "healthy",
  }

  // Check session.json
  const sessionFp = sessionPath(projectRoot)
  try {
    await fs.access(sessionFp)
    const sessionValid = await verifyLiveFileChecksum(sessionFp)
    if (!sessionValid) {
      report.session.status = "corrupted"
    }
  } catch {
    report.session.status = "missing"
  }

  // Check config.json
  const configFp = configPath(projectRoot)
  try {
    await fs.access(configFp)
    const configValid = await verifyLiveFileChecksum(configFp)
    if (!configValid) {
      report.config.status = "corrupted"
    }
  } catch {
    report.config.status = "missing"
  }

  // Check features
  const sDir = specsDirPath(projectRoot)
  try {
    const entries = await fs.readdir(sDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const base = path.join(sDir, entry.name)
        const featureHealth: FeatureHealth = {
          dir: entry.name,
          spec_json: "healthy",
          backups: { total: 0, valid: 0, corrupted: 0 },
        }

        // Check spec.json
        const sjFp = specJsonPath(base)
        try {
          await fs.access(sjFp)
          const sjValid = await verifyLiveFileChecksum(sjFp)
          if (!sjValid) {
            featureHealth.spec_json = "corrupted"
          }
        } catch {
          featureHealth.spec_json = "missing"
        }

        // Check backups
        const backupDir = path.join(projectRoot, ".opencode", BACKUP_DIR_NAME)
        try {
          const bakFiles = await fs.readdir(backupDir)
          const featureBaks = bakFiles.filter(f => f.includes(entry.name) && f.endsWith(".bak"))
          featureHealth.backups.total = featureBaks.length
          for (const bak of featureBaks) {
            const bakPath = path.join(backupDir, bak)
            try {
              const content = await fs.readFile(bakPath, "utf-8")
              const valid = await verifyChecksum(bakPath, content)
              if (valid) featureHealth.backups.valid++
              else featureHealth.backups.corrupted++
            } catch {
              featureHealth.backups.corrupted++
            }
          }
        } catch {
          // no backup dir
        }

        report.features.push(featureHealth)
      }
    }
  } catch {
    // no specs dir
  }

  // Determine overall status
  const hasCorrupted = report.session.status === "corrupted" || report.config.status === "corrupted"
    || report.features.some(f => f.spec_json === "corrupted")
  const hasRestored = report.session.status === "restored" || report.config.status === "restored"
    || report.features.some(f => f.spec_json === "restored")
  const hasMissing = report.session.status === "missing" || report.config.status === "missing"
    || report.features.some(f => f.spec_json === "missing")

  if (hasCorrupted || hasMissing) report.overall = "critical"
  else if (hasRestored) report.overall = "degraded"
  else report.overall = "healthy"

  return report
}
