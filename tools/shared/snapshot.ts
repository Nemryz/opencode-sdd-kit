import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import type { Dirent } from "node:fs"
import { atomicWriteFile, stripBom } from "./io"
import { RestoreJournalSchema, SnapshotManifestSchema, type RestoreJournal, type SnapshotManifest } from "./schemas"

const SNAPSHOTS_DIR_NAME = "snapshots"
const EXCLUDED_DIRS = [".opencode/backups", ".opencode/snapshots"]
const EXCLUDED_SUFFIXES = [".lock", ".tmp", ".bak", ".sha256"]

const CORE_FILES = [
  ".opencode/spec-memory/session.json",
  ".opencode/spec-memory/config.json",
  ".opencode/spec-memory/constitution.md",
  ".opencode/guard.json",
]

const OPTIONAL_FILES = [".opencode/domain-map.md"]

function toPosix(p: string): string {
  return p.split(path.sep).join("/")
}

function isExcluded(relPath: string): boolean {
  const posix = toPosix(relPath)
  if (EXCLUDED_DIRS.some((dir) => posix === dir || posix.startsWith(`${dir}/`))) return true
  return EXCLUDED_SUFFIXES.some((suffix) => posix.endsWith(suffix))
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function walkFiles(absDir: string, relBase: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(absDir, { withFileTypes: true }).catch(() => [] as Dirent[])
  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name
    if (isExcluded(rel)) continue
    const abs = path.join(absDir, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(abs, rel, out)
    } else if (entry.isFile()) {
      out.push(rel)
    }
  }
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex")
}

function formatTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0")
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function slugifyTrigger(trigger: string): string {
  const slug = trigger.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)
  return slug || "snapshot"
}

export function snapshotsDirPath(root: string): string {
  return path.join(root, ".opencode", SNAPSHOTS_DIR_NAME)
}

export async function collectScope(root: string): Promise<string[]> {
  const files: string[] = []
  for (const rel of [...CORE_FILES, ...OPTIONAL_FILES]) {
    const abs = path.join(root, ...rel.split("/"))
    try {
      const stat = await fs.stat(abs)
      if (stat.isFile()) files.push(rel)
    } catch {
      // missing core/optional file is fine
    }
  }
  await walkFiles(path.join(root, "specs"), "specs", files)
  await walkFiles(path.join(root, ".opencode", "steering"), ".opencode/steering", files)
  return files
}

export interface CreateSnapshotOptions {
  trigger: string
  feature?: string | null
  phase?: string | null
  now?: Date
}

export async function createSnapshot(root: string, options: CreateSnapshotOptions): Promise<SnapshotManifest> {
  const now = options.now ?? new Date()
  const baseId = `${formatTimestamp(now)}-${slugifyTrigger(options.trigger)}`
  const dir = snapshotsDirPath(root)
  await fs.mkdir(dir, { recursive: true })

  let id = baseId
  let counter = 2
  while (await pathExists(path.join(dir, id))) {
    id = `${baseId}-${counter}`
    counter++
  }
  const snapshotDir = path.join(dir, id)

  try {
    const relPaths = await collectScope(root)
    const files: SnapshotManifest["files"] = []
    for (const rel of relPaths) {
      const content = await fs.readFile(path.join(root, ...rel.split("/")))
      const dest = path.join(snapshotDir, ...rel.split("/"))
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, content)
      files.push({ path: rel, size: content.byteLength, sha256: sha256(content) })
    }

    const manifest = SnapshotManifestSchema.parse({
      format: 1,
      id,
      created_at: now.toISOString(),
      trigger: options.trigger,
      feature: options.feature ?? null,
      phase: options.phase ?? null,
      files,
    })

    await atomicWriteFile(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2))

    const verification = await verifySnapshot(root, id)
    if (!verification.ok) {
      throw new Error(`snapshot verification failed for ${id}`)
    }
    return manifest
  } catch (err) {
    await fs.rm(snapshotDir, { recursive: true, force: true })
    throw err instanceof Error ? err : new Error(String(err))
  }
}

export async function readSnapshotManifest(root: string, id: string): Promise<SnapshotManifest | null> {
  try {
    const raw = await fs.readFile(path.join(snapshotsDirPath(root), id, "manifest.json"), "utf-8")
    const parsed = SnapshotManifestSchema.safeParse(JSON.parse(stripBom(raw)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export interface SnapshotVerification {
  id: string
  ok: boolean
  error: string | null
  manifest: SnapshotManifest | null
  entries: Array<{ path: string; status: "ok" | "mismatch" | "missing" }>
}

export async function verifySnapshot(root: string, id: string): Promise<SnapshotVerification> {
  const manifest = await readSnapshotManifest(root, id)
  if (!manifest) {
    return { id, ok: false, error: "manifest unreadable", manifest: null, entries: [] }
  }
  const entries: SnapshotVerification["entries"] = []
  for (const file of manifest.files) {
    const abs = path.join(snapshotsDirPath(root), id, ...file.path.split("/"))
    try {
      const content = await fs.readFile(abs)
      entries.push({ path: file.path, status: sha256(content) === file.sha256 ? "ok" : "mismatch" })
    } catch {
      entries.push({ path: file.path, status: "missing" })
    }
  }
  const ok = entries.every((entry) => entry.status === "ok")
  return { id, ok, error: null, manifest, entries }
}

export interface SnapshotListEntry {
  id: string
  createdAt: string | null
  trigger: string | null
  feature: string | null
  fileCount: number
  totalSize: number
  status: "verified" | "mismatched" | "unreadable"
}

export async function listSnapshots(root: string): Promise<SnapshotListEntry[]> {
  const dir = snapshotsDirPath(root)
  const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])
  const entries: SnapshotListEntry[] = []
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue
    const id = dirent.name
    const verification = await verifySnapshot(root, id)
    if (!verification.manifest) {
      entries.push({
        id,
        createdAt: null,
        trigger: null,
        feature: null,
        fileCount: 0,
        totalSize: 0,
        status: "unreadable",
      })
      continue
    }
    const totalSize = verification.manifest.files.reduce((sum, file) => sum + file.size, 0)
    entries.push({
      id,
      createdAt: verification.manifest.created_at,
      trigger: verification.manifest.trigger,
      feature: verification.manifest.feature,
      fileCount: verification.manifest.files.length,
      totalSize,
      status: verification.ok ? "verified" : "mismatched",
    })
  }
  entries.sort((a, b) => b.id.localeCompare(a.id))
  return entries
}

// ─────────────────────────── Restore journal ───────────────────────────

const RESTORE_JOURNAL_NAME = ".restore-journal.json"

export function restoreJournalPath(root: string): string {
  return path.join(snapshotsDirPath(root), RESTORE_JOURNAL_NAME)
}

export async function readRestoreJournal(root: string): Promise<RestoreJournal | null> {
  try {
    const raw = await fs.readFile(restoreJournalPath(root), "utf-8")
    const parsed = RestoreJournalSchema.safeParse(JSON.parse(stripBom(raw)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function writeRestoreJournal(root: string, journal: RestoreJournal): Promise<void> {
  const parsed = RestoreJournalSchema.parse(journal)
  await atomicWriteFile(restoreJournalPath(root), JSON.stringify(parsed, null, 2))
}

export async function clearRestoreJournal(root: string): Promise<void> {
  await fs.rm(restoreJournalPath(root), { force: true })
}

// ─────────────────────────── Restore helpers ───────────────────────────

function assertSafeManifestPath(rel: string): void {
  const unsafe =
    !rel ||
    rel.startsWith("/") ||
    rel.startsWith("\\") ||
    /^[A-Za-z]:/.test(rel) ||
    rel.includes("\\") ||
    rel.split("/").some((segment) => segment === ".." || segment === "")
  if (unsafe) {
    throw new Error(`unsafe snapshot path: ${rel}`)
  }
}

async function applyManifest(
  root: string,
  snapshotId: string,
  manifest: SnapshotManifest,
  paths: string[] | null,
  removeExtras: boolean,
): Promise<{ restored: string[]; removed: string[] }> {
  const snapshotDir = path.join(snapshotsDirPath(root), snapshotId)
  const targets = paths === null ? manifest.files : manifest.files.filter((file) => paths.includes(file.path))
  const restored: string[] = []
  for (const file of targets) {
    assertSafeManifestPath(file.path)
    const content = await fs.readFile(path.join(snapshotDir, ...file.path.split("/")))
    if (sha256(content) !== file.sha256) {
      throw new Error(`snapshot file checksum mismatch: ${file.path}`)
    }
    await atomicWriteFile(path.join(root, ...file.path.split("/")), content)
    restored.push(file.path)
  }
  const removed: string[] = []
  if (removeExtras) {
    const manifestPaths = new Set(manifest.files.map((file) => file.path))
    const current = await collectScope(root)
    for (const rel of current) {
      if (!manifestPaths.has(rel)) {
        await fs.rm(path.join(root, ...rel.split("/")), { force: true })
        removed.push(rel)
      }
    }
  }
  return { restored, removed }
}

// ─────────────────────────── Preview ───────────────────────────

export interface RestorePreview {
  id: string
  mode: "full" | "selective"
  entries: Array<{ path: string; status: "identical" | "changed" | "missing" }>
  extras: string[]
  errors: string[]
}

export async function previewRestore(
  root: string,
  id: string,
  options?: { mode?: "full" | "selective"; files?: string[] },
): Promise<RestorePreview> {
  const mode = options?.mode ?? "full"
  const manifest = await readSnapshotManifest(root, id)
  if (!manifest) {
    throw new Error(`snapshot ${id} is unreadable`)
  }
  const errors: string[] = []
  let targets = manifest.files
  if (mode === "selective") {
    const requested = options?.files ?? []
    const manifestPaths = new Set(manifest.files.map((file) => file.path))
    const safe: string[] = []
    for (const rel of requested) {
      try {
        assertSafeManifestPath(rel)
      } catch {
        errors.push(`unsafe snapshot path: ${rel}`)
        continue
      }
      if (!manifestPaths.has(rel)) {
        errors.push(`path not in snapshot manifest: ${rel}`)
        continue
      }
      safe.push(rel)
    }
    targets = manifest.files.filter((file) => safe.includes(file.path))
  }
  const entries: RestorePreview["entries"] = []
  for (const file of targets) {
    try {
      const content = await fs.readFile(path.join(root, ...file.path.split("/")))
      entries.push({ path: file.path, status: sha256(content) === file.sha256 ? "identical" : "changed" })
    } catch {
      entries.push({ path: file.path, status: "missing" })
    }
  }
  let extras: string[] = []
  if (mode === "full") {
    const manifestPaths = new Set(manifest.files.map((file) => file.path))
    extras = (await collectScope(root)).filter((rel) => !manifestPaths.has(rel))
  }
  return { id, mode, entries, extras, errors }
}

// ─────────────────────────── Restore ───────────────────────────

export interface RestoreOptions {
  confirmed: boolean
  mode?: "full" | "selective"
  files?: string[]
  now?: Date
}

export interface RestoreReport {
  id: string
  mode: "full" | "selective"
  restored: string[]
  removed: string[]
  safetySnapshotId: string
}

export async function restoreSnapshot(root: string, id: string, options: RestoreOptions): Promise<RestoreReport> {
  const mode = options.mode ?? "full"
  if (!options.confirmed) {
    throw new Error("restore requires confirmed: true after explicit user confirmation")
  }
  const manifest = await readSnapshotManifest(root, id)
  if (!manifest) {
    throw new Error(`snapshot ${id} is unreadable`)
  }
  const verification = await verifySnapshot(root, id)
  if (!verification.ok) {
    throw new Error(`snapshot ${id} failed verification`)
  }

  const manifestPaths = new Set(manifest.files.map((file) => file.path))
  let paths: string[] | null = null
  if (mode === "selective") {
    const requested = options.files ?? []
    if (requested.length === 0) {
      throw new Error("selective restore requires at least one file")
    }
    for (const rel of requested) {
      assertSafeManifestPath(rel)
      if (!manifestPaths.has(rel)) {
        throw new Error(`path not in snapshot manifest: ${rel}`)
      }
    }
    paths = requested
  }

  const now = options.now ?? new Date()
  const safety = await createSnapshot(root, { trigger: `pre-restore:${id}`, now })
  const journal: RestoreJournal = {
    format: 1,
    snapshot_id: id,
    safety_snapshot_id: safety.id,
    mode,
    started_at: now.toISOString(),
    files: paths ?? manifest.files.map((file) => file.path),
    removed: [],
  }
  await writeRestoreJournal(root, journal)

  try {
    const applied = await applyManifest(root, id, manifest, paths, mode === "full")
    await clearRestoreJournal(root)
    return { id, mode, restored: applied.restored, removed: applied.removed, safetySnapshotId: safety.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const safetyManifest = await readSnapshotManifest(root, safety.id)
    if (safetyManifest) {
      try {
        await applyManifest(root, safety.id, safetyManifest, null, true)
      } catch (rollbackErr) {
        const rollbackMessage = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
        throw new Error(
          `restore failed (${message}); rollback failed (${rollbackMessage}) — journal kept for recovery`,
        )
      }
    }
    await clearRestoreJournal(root)
    throw new Error(`restore failed and was rolled back: ${message}`)
  }
}

// ─────────────────────────── Interrupted restore recovery ───────────────────────────

export interface RestoreRecovery {
  recovered: boolean
  safetySnapshotId: string | null
  error: string | null
}

export async function recoverInterruptedRestore(root: string): Promise<RestoreRecovery> {
  const journal = await readRestoreJournal(root)
  if (!journal) {
    return { recovered: false, safetySnapshotId: null, error: null }
  }
  const safetyManifest = await readSnapshotManifest(root, journal.safety_snapshot_id)
  if (!safetyManifest) {
    return {
      recovered: false,
      safetySnapshotId: journal.safety_snapshot_id,
      error: "journal references an unreadable safety snapshot",
    }
  }
  try {
    await applyManifest(root, journal.safety_snapshot_id, safetyManifest, null, true)
    await clearRestoreJournal(root)
    return { recovered: true, safetySnapshotId: journal.safety_snapshot_id, error: null }
  } catch (err) {
    return {
      recovered: false,
      safetySnapshotId: journal.safety_snapshot_id,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
