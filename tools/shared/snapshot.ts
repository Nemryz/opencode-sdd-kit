import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import type { Dirent } from "node:fs"
import { atomicWriteFile, stripBom } from "./io"
import { SnapshotManifestSchema, type SnapshotManifest } from "./schemas"

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
