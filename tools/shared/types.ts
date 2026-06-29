import path from "node:path"
import fs from "node:fs/promises"
import { z } from "zod"

// ─────────────────────────── Paths ───────────────────────────

export const PATHS = {
  OPENCODE_DIR: ".opencode",
  SPEC_MEMORY_DIR: "spec-memory",
  SESSION_FILE: "session.json",
  CONFIG_FILE: "config.json",
  CONSTITUTION_FILE: "constitution.md",
  SPECS_DIR: "specs",
} as const

export function sessionPath(root: string): string {
  return path.join(root, PATHS.OPENCODE_DIR, PATHS.SPEC_MEMORY_DIR, PATHS.SESSION_FILE)
}

export function configPath(root: string): string {
  return path.join(root, PATHS.OPENCODE_DIR, PATHS.SPEC_MEMORY_DIR, PATHS.CONFIG_FILE)
}

export function constitutionPath(root: string): string {
  return path.join(root, PATHS.OPENCODE_DIR, PATHS.SPEC_MEMORY_DIR, PATHS.CONSTITUTION_FILE)
}

export function specJsonPath(featureDir: string): string {
  return path.join(featureDir, "spec.json")
}

export function specsDirPath(root: string): string {
  return path.join(root, PATHS.SPECS_DIR)
}

// ─────────────────────────── Zod schemas ───────────────────────────

const ApprovalStateSchema = z.object({
  generated: z.boolean(),
  approved: z.boolean(),
})

export const SpecJsonSchema = z.object({
  feature_name: z.string(),
  feature_number: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  phase: z.enum(["spec", "plan", "tasks", "ready", "impl", "complete"]),
  approvals: z.object({
    spec: ApprovalStateSchema,
    plan: ApprovalStateSchema,
    tasks: ApprovalStateSchema,
  }),
  ready_for_implementation: z.boolean(),
})

// ─────────────────────────── Types ───────────────────────────

export interface ApprovalState {
  generated: boolean
  approved: boolean
}

export type Phase = "spec" | "plan" | "tasks" | "ready" | "impl" | "complete"

export interface SpecJson {
  feature_name: string
  feature_number: number
  created_at: string
  updated_at: string
  phase: Phase
  approvals: {
    spec: ApprovalState
    plan: ApprovalState
    tasks: ApprovalState
  }
  ready_for_implementation: boolean
}

export interface SessionState {
  command: string | null
  phase: string
  featureDir: string | null
  featureNumber: number | null
  featureName: string | null
  nextStep: string | null
  lastResult: string | null
  history: string[]
}

export interface SDDConfig {
  defaultTechStack: string | null
  lastUsedLanguage: string | null
  preferences: Record<string, string>
}

// ─────────────────────────── Constants ───────────────────────────

export const DEFAULT_SESSION: SessionState = {
  command: null,
  phase: "init",
  featureDir: null,
  featureNumber: null,
  featureName: null,
  nextStep: "/spec <description>",
  lastResult: null,
  history: [],
}

export const DEFAULT_CONFIG: SDDConfig = {
  defaultTechStack: null,
  lastUsedLanguage: null,
  preferences: {},
}

export const PHASE_NEXT_STEP: Record<string, string> = {
  init: "/spec <description>",
  spec: "/plan <tech stack>",
  plan: "/tasks",
  tasks: "/tasks (approve) or /impl",
  ready: "/impl or /review",
  impl: "/impl (continue)",
  complete: "/review or start a new feature",
}

// ─────────────────────────── Utilities ───────────────────────────

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function parseNNN(dirName: string): number {
  const match = dirName.match(/^(\d+)-/)
  return match ? parseInt(match[1], 10) : 0
}

export function detectPhase(
  specOk: boolean,
  planOk: boolean,
  tasksOk: boolean,
  constitutionExists: boolean,
): { phase: string; nextStep: string } {
  if (!constitutionExists) {
    return { phase: "init", nextStep: "/spec <description>" }
  }
  if (!specOk) {
    return { phase: "spec", nextStep: "/spec <description>" }
  }
  if (!planOk) {
    return { phase: "plan", nextStep: "/plan <tech stack>" }
  }
  if (!tasksOk) {
    return { phase: "tasks", nextStep: "/tasks" }
  }
  return { phase: "ready", nextStep: "/impl or /review" }
}

export function detectPhaseFromFiles(
  specOk: boolean,
  planOk: boolean,
  tasksOk: boolean,
): string {
  if (!specOk) return "spec"
  if (!planOk) return "plan"
  if (!tasksOk) return "tasks"
  return "ready"
}

// ─────────────────────────── Session I/O ───────────────────────────

export async function readSession(root: string): Promise<SessionState> {
  try {
    const data = await fs.readFile(sessionPath(root), "utf-8")
    return { ...DEFAULT_SESSION, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_SESSION }
  }
}

export async function writeSession(root: string, s: SessionState): Promise<void> {
  const dir = path.dirname(sessionPath(root))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(sessionPath(root), JSON.stringify(s, null, 2), "utf-8")
}

// ─────────────────────────── SpecJson I/O ───────────────────────────

export async function readSpecJson(featureDir: string): Promise<SpecJson | null> {
  try {
    const data = await fs.readFile(specJsonPath(featureDir), "utf-8")
    const parsed = JSON.parse(data)
    const result = SpecJsonSchema.safeParse(parsed)
    if (result.success) {
      return result.data as SpecJson
    }
    console.warn(`spec.json validation failed for ${featureDir}:`, result.error)
    return parsed as SpecJson
  } catch {
    return null
  }
}

export async function writeSpecJson(sj: SpecJson, featureDir: string): Promise<void> {
  sj.updated_at = new Date().toISOString()
  await fs.writeFile(specJsonPath(featureDir), JSON.stringify(sj, null, 2), "utf-8")
}

// ─────────────────────────── Feature directory utilities ───────────────────────────

export async function getFeatureDirs(projectRoot: string): Promise<string[]> {
  const sDir = specsDirPath(projectRoot)
  try {
    const entries = await fs.readdir(sDir, { withFileTypes: true })
    const dirs: { name: string; nnn: number }[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nnn = parseNNN(entry.name)
        if (nnn > 0) {
          dirs.push({ name: entry.name, nnn })
        }
      }
    }
    dirs.sort((a, b) => a.nnn - b.nnn)
    return dirs.map(d => d.name)
  } catch {
    return []
  }
}

export async function getLatestFeatureDir(projectRoot: string): Promise<string | null> {
  const sDir = specsDirPath(projectRoot)
  try {
    const entries = await fs.readdir(sDir, { withFileTypes: true })
    const dirs: { name: string; nnn: number }[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nnn = parseNNN(entry.name)
        if (nnn > 0) {
          dirs.push({ name: entry.name, nnn })
        }
      }
    }
    dirs.sort((a, b) => b.nnn - a.nnn)
    return dirs.length > 0 ? dirs[0].name : null
  } catch {
    return null
  }
}

export function makeSpecJson(featureName: string, featureNumber: number): SpecJson {
  const now = new Date().toISOString()
  return {
    feature_name: featureName,
    feature_number: featureNumber,
    created_at: now,
    updated_at: now,
    phase: "spec",
    approvals: {
      spec: { generated: false, approved: false },
      plan: { generated: false, approved: false },
      tasks: { generated: false, approved: false },
    },
    ready_for_implementation: false,
  }
}
