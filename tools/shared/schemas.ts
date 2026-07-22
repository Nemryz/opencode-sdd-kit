import path from "node:path"
import { z } from "zod"

export const PATHS = {
  OPENCODE_DIR: ".opencode",
  SPEC_MEMORY_DIR: "spec-memory",
  STEERING_DIR: "steering",
  SESSION_FILE: "session.json",
  CONFIG_FILE: "config.json",
  CONSTITUTION_FILE: "constitution.md",
  PRODUCT_STEERING_FILE: "product.md",
  TECH_STEERING_FILE: "tech.md",
  STRUCTURE_STEERING_FILE: "structure.md",
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

export function steeringDirPath(root: string): string {
  return path.join(root, PATHS.OPENCODE_DIR, PATHS.STEERING_DIR)
}

export function productSteeringPath(root: string): string {
  return path.join(steeringDirPath(root), PATHS.PRODUCT_STEERING_FILE)
}

export function techSteeringPath(root: string): string {
  return path.join(steeringDirPath(root), PATHS.TECH_STEERING_FILE)
}

export function structureSteeringPath(root: string): string {
  return path.join(steeringDirPath(root), PATHS.STRUCTURE_STEERING_FILE)
}

export const ApprovalStateSchema = z.object({
  generated: z.boolean(),
  approved: z.boolean(),
})

export const SpecJsonSchema = z.object({
  feature_name: z.string().min(1),
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

export const SessionStateSchema = z.object({
  command: z.string().nullable(),
  phase: z.enum(["init", "spec", "plan", "tasks", "ready", "impl", "complete"]),
  featureDir: z.string().nullable(),
  featureNumber: z.number().nullable(),
  featureName: z.string().nullable(),
  nextStep: z.string().nullable(),
  lastResult: z.string().nullable(),
  history: z.array(z.string()),
})

export const ConfigSchema = z.object({
  defaultTechStack: z.string().nullable(),
  lastUsedLanguage: z.string().nullable(),
  expressMode: z.boolean(),
  autoVersioning: z.boolean(),
  preferences: z.record(z.string(), z.string()),
})

export type ApprovalState = z.infer<typeof ApprovalStateSchema>
export type Phase = z.infer<typeof SpecJsonSchema>["phase"]
export type SpecJson = z.infer<typeof SpecJsonSchema>
export type SessionState = z.infer<typeof SessionStateSchema>
export type SDDConfig = z.infer<typeof ConfigSchema>

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
  expressMode: false,
  autoVersioning: false,
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

const VALID_PHASES: readonly string[] = ["spec", "plan", "tasks", "ready", "impl", "complete"]

function isPhase(s: string): s is Phase {
  return VALID_PHASES.includes(s)
}

export function parsePhase(s: string): Phase {
  if (s === "init") return "spec"
  return isPhase(s) ? s : "spec"
}
