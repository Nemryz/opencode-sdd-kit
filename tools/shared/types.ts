import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import { z } from "zod"

// ─────────────────────────── Paths ───────────────────────────

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

// ─────────────────────────── Zod schemas ───────────────────────────

const ApprovalStateSchema = z.object({
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
  preferences: z.record(z.string(), z.string()),
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
  expressMode: boolean
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
  expressMode: false,
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

// ─────────────────────────── Project root validation ───────────

export async function isValidProjectRoot(root: string): Promise<boolean> {
  try {
    const specMemoryDir = path.join(root, PATHS.OPENCODE_DIR, PATHS.SPEC_MEMORY_DIR)
    await fs.access(specMemoryDir)
    return true
  } catch {
    return false
  }
}

// ─────────────────────────── Project Discovery ───────────────────────────

export interface ProjectContext {
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | "unknown"
  framework: string | null
  hasTypeScript: boolean
  hasESLint: boolean
  hasTestingFramework: boolean
  configFiles: string[]
  dependencies: string[]
  devDependencies: string[]
  scripts: string[]
  topLevelDirs: string[]
}

const PACKAGE_MANAGER_FILES: Record<string, "npm" | "yarn" | "pnpm" | "bun"> = {
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "pnpm-lock.yaml": "pnpm",
  "bun.lockb": "bun",
}

const FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  next: [/^next$/i, /^@next\//i],
  remix: [/^remix$/i, /^@remix-run\//i],
  nuxt: [/^nuxt$/i, /^nuxt\//i],
  gatsby: [/^gatsby$/i, /^gatsby-\//i],
  astro: [/^astro$/i, /^@astrojs\//i],
  vite: [/^vite$/i, /^@vitejs\//i],
  express: [/^express$/i],
  fastify: [/^fastify$/i],
  nest: [/^@nestjs\//i],
  hono: [/^hono$/i],
  react: [/^react$/i, /^react-dom$/i],
  vue: [/^vue$/i, /^vue-router$/i],
  svelte: [/^svelte$/i, /^@sveltejs\//i],
  solid: [/^solid-js$/i, /^@solidjs\//i],
  angular: [/^@angular\//i],
  electron: [/^electron$/i],
  tauri: [/^@tauri-apps\//i],
}

export async function detectPackageManager(root: string): Promise<"npm" | "yarn" | "pnpm" | "bun" | "unknown"> {
  for (const [fileName, pm] of Object.entries(PACKAGE_MANAGER_FILES)) {
    if (await exists(path.join(root, fileName))) {
      return pm
    }
  }
  return "unknown"
}

export async function detectFramework(root: string, dependencies: string[]): Promise<string | null> {
  if (dependencies.length === 0) return null
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    for (const pattern of patterns) {
      if (dependencies.some(dep => pattern.test(dep))) {
        return framework
      }
    }
  }
  return null
}

export async function detectConfigFiles(root: string): Promise<string[]> {
  const candidates = [
    "tsconfig.json", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yaml",
    "jest.config.ts", "jest.config.js", "vitest.config.ts", "vitest.config.js",
    ".prettierrc", ".prettierrc.json", "Makefile", "Dockerfile",
    "docker-compose.yml", ".env.example", ".gitignore", "turbo.json",
  ]
  const found: string[] = []
  for (const file of candidates) {
    if (await exists(path.join(root, file))) {
      found.push(file)
    }
  }
  return found
}

export async function detectScripts(root: string): Promise<{ scripts: string[]; dependencies: string[]; devDependencies: string[] }> {
  const pkgPath = path.join(root, "package.json")
  if (!(await exists(pkgPath))) {
    return { scripts: [], dependencies: [], devDependencies: [] }
  }
  try {
    const raw = await fs.readFile(pkgPath, "utf-8")
    const pkg = JSON.parse(raw)
    const scripts = pkg.scripts ? Object.keys(pkg.scripts) : []
    const dependencies = pkg.dependencies ? Object.keys(pkg.dependencies) : []
    const devDependencies = pkg.devDependencies ? Object.keys(pkg.devDependencies) : []
    return { scripts, dependencies, devDependencies }
  } catch {
    return { scripts: [], dependencies: [], devDependencies: [] }
  }
}

export async function discoverProject(root: string): Promise<ProjectContext> {
  const packageManager = await detectPackageManager(root)
  const foundScripts = await detectScripts(root)
  const configFiles = await detectConfigFiles(root)
  const allDeps = [...foundScripts.dependencies, ...foundScripts.devDependencies]
  const framework = await detectFramework(root, allDeps)
  const hasTypeScript = foundScripts.dependencies.includes("typescript") || foundScripts.devDependencies.includes("typescript") || configFiles.includes("tsconfig.json")
  const hasESLint = configFiles.some(f => f.startsWith(".eslintrc"))
  const hasTestingFramework = foundScripts.dependencies.some(d => /^(jest|vitest|mocha|ava|tap|playwright|cypress)/i.test(d))
    || foundScripts.devDependencies.some(d => /^(jest|vitest|mocha|ava|tap|playwright|cypress)/i.test(d))
  let topLevelDirs: string[] = []
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    topLevelDirs = entries.filter(e => e.isDirectory()).map(e => e.name).filter(n => !n.startsWith(".") && n !== "node_modules")
  } catch {
    // ignore
  }
  return {
    packageManager,
    framework,
    hasTypeScript,
    hasESLint,
    hasTestingFramework,
    configFiles,
    dependencies: foundScripts.dependencies,
    devDependencies: foundScripts.devDependencies,
    scripts: foundScripts.scripts,
    topLevelDirs,
  }
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

// ─────────────────────────── Error / Cast helpers ───────────────────────────

export function isENOENT(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as Record<string, unknown>).code === "ENOENT"
}

export function isEEXIST(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as Record<string, unknown>).code === "EEXIST"
}

export function isESRCH(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as Record<string, unknown>).code === "ESRCH"
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

const VALID_PHASES: readonly string[] = ["spec", "plan", "tasks", "ready", "impl", "complete"]

function isPhase(s: string): s is Phase {
  return VALID_PHASES.includes(s)
}

export function parsePhase(s: string): Phase {
  return isPhase(s) ? s : "spec"
}

// ─────────────────────────── Session I/O ───────────────────────────

export async function readSession(root: string): Promise<SessionState> {
  try {
    const data = await fs.readFile(sessionPath(root), "utf-8")
    const parsed = JSON.parse(data)
    const merged = { ...DEFAULT_SESSION, ...parsed }
    const result = SessionStateSchema.safeParse(merged)
    if (result.success) {
      return result.data
    }
    console.warn(`session.json validation failed for ${root}:`, result.error)
    return { ...DEFAULT_SESSION }
  } catch {
    return { ...DEFAULT_SESSION }
  }
}

export async function writeSession(root: string, s: SessionState): Promise<void> {
  const fp = sessionPath(root)
  const dir = path.dirname(fp)
  await fs.mkdir(dir, { recursive: true })
  const handle = await acquireLock(fp)
  try {
    await fs.writeFile(fp, JSON.stringify(s, null, 2), "utf-8")
  } finally {
    await releaseLock(handle)
  }
}

// ─────────────────────────── SpecJson I/O ───────────────────────────

export async function readSpecJson(featureDir: string): Promise<SpecJson | null> {
  try {
    const data = await fs.readFile(specJsonPath(featureDir), "utf-8")
    const parsed = JSON.parse(data)
    const result = SpecJsonSchema.safeParse(parsed)
    if (result.success) {
      return result.data
    }
    console.warn(`spec.json validation failed for ${featureDir}:`, result.error)
    return null
  } catch {
    return null
  }
}

export async function writeSpecJson(sj: SpecJson, featureDir: string): Promise<void> {
  sj.updated_at = new Date().toISOString()
  const fp = specJsonPath(featureDir)
  const handle = await acquireLock(fp)
  try {
    await fs.writeFile(fp, JSON.stringify(sj, null, 2), "utf-8")
  } finally {
    await releaseLock(handle)
  }
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
    dirs.sort((a, b) => a.nnn - b.nnn || a.name.localeCompare(b.name))
    return dirs.map(d => d.name)
  } catch {
    return []
  }
}

export async function getLatestFeatureDir(projectRoot: string): Promise<string | null> {
  const dirs = await getFeatureDirs(projectRoot)
  return dirs.length > 0 ? dirs[dirs.length - 1] : null
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

// ─────────────────────────── Complexity Assessment ───────────────────────────

export type ComplexityLevel = "simple" | "standard" | "complex"

export interface ComplexityResult {
  level: ComplexityLevel
  score: number
  reasoning: string[]
}

const COMPLEXITY_KEYWORDS: { pattern: RegExp; score: number; reason: string }[] = [
  { pattern: /\bmigrat(e|ion)\b|\bupgrade\b/i, score: 2, reason: "migration task detected: high risk of breaking changes" },
  { pattern: /\brefactor\b|\brestructure\b|\brewrite\b/i, score: 1, reason: "refactoring task: needs careful regression testing" },
  { pattern: /\bsecurity\b|\bauth(entication|orization)?\b/i, score: 1, reason: "security-sensitive task: requires review" },
  { pattern: /\bperform(ance)?\b|\boptimiz(e|ation)\b|\bperf\b/i, score: 1, reason: "performance optimization: needs benchmarking" },
  { pattern: /\bdatabase\b|\bschema\b|\bddl\b|\bdml\b/i, score: 1, reason: "database changes: requires migration handling" },
  { pattern: /\bapi\b|\bendpoint\b|\bgraphql\b|\brest\b/i, score: 1, reason: "API surface changes: needs versioning consideration" },
  { pattern: /\bconcurrent\b|\bparallel\b|\basync\b|\brace condition\b/i, score: 1, reason: "concurrency work: needs careful synchronization" },
  { pattern: /\bcach(e|ing)\b|\bqueue\b|\bpub\.sub\b|\bmessaging\b/i, score: 1, reason: "infrastructure changes: messaging, caching, or queues" },
]

export async function assessComplexity(
  taskDescription: string,
  filesAffected: number,
  hasNewDependencies: boolean,
  hasBoundaryAnnotations: boolean,
  hasNeedsClarification: boolean,
  context?: ProjectContext,
): Promise<ComplexityResult> {
  const reasoning: string[] = []
  let score = 0

  // task description keyword analysis
  const usedReasons = new Set<string>()
  for (const rule of COMPLEXITY_KEYWORDS) {
    if (rule.pattern.test(taskDescription) && !usedReasons.has(rule.reason)) {
      reasoning.push(rule.reason)
      score += rule.score
      usedReasons.add(rule.reason)
    }
  }

  // files affected
  if (filesAffected <= 1) {
    reasoning.push("1 or fewer files affected")
  } else if (filesAffected <= 3) {
    reasoning.push("2-3 files affected")
    score += 1
  } else if (filesAffected <= 8) {
    reasoning.push("4-8 files affected")
    score += 3
  } else {
    reasoning.push("9+ files affected")
    score += 5
  }

  // new dependencies
  if (hasNewDependencies) {
    reasoning.push("new external dependencies required")
    score += 3
  } else {
    reasoning.push("no new external dependencies")
  }

  // boundary annotations
  if (hasBoundaryAnnotations) {
    reasoning.push("multiple boundaries involved, coordination needed")
    score += 2
  } else {
    reasoning.push("single boundary or no boundary concerns")
  }

  // clarification needed
  if (hasNeedsClarification) {
    reasoning.push("spec has unresolved [NEEDS CLARIFICATION] markers")
    score += 2
  } else {
    reasoning.push("spec is clear with no unresolved markers")
  }

  // framework knowledge from context
  if (context?.framework === null && context?.packageManager !== "unknown") {
    reasoning.push("project has no detected framework (may need research)")
    score += 1
  }

  let level: ComplexityLevel
  if (score <= 2) {
    level = "simple"
  } else if (score <= 6) {
    level = "standard"
  } else {
    level = "complex"
  }

  reasoning.push(`total score: ${score}, routing to ${level}`)
  return { level, score, reasoning }
}
