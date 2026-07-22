import path from "node:path"
import fs from "node:fs/promises"
import { PATHS, SpecJson, SessionState, specsDirPath } from "./schemas"
import { exists, isENOENT } from "./io"

// Re-export everything from schemas and io for backward compatibility
export * from "./schemas"
export * from "./io"

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

const FRAMEWORK_PATTERNS: readonly [string, RegExp[]][] = [
  ["next", [/^next$/i, /^@next\//i]],
  ["remix", [/^remix$/i, /^@remix-run\//i]],
  ["nuxt", [/^nuxt$/i, /^nuxt\//i]],
  ["gatsby", [/^gatsby$/i, /^gatsby-\//i]],
  ["astro", [/^astro$/i, /^@astrojs\//i]],
  ["vite", [/^vite$/i, /^@vitejs\//i]],
  ["express", [/^express$/i]],
  ["fastify", [/^fastify$/i]],
  ["nest", [/^@nestjs\//i]],
  ["hono", [/^hono$/i]],
  ["react", [/^react$/i, /^react-dom$/i]],
  ["vue", [/^vue$/i, /^vue-router$/i]],
  ["svelte", [/^svelte$/i, /^@sveltejs\//i]],
  ["solid", [/^solid-js$/i, /^@solidjs\//i]],
  ["angular", [/^@angular\//i]],
  ["electron", [/^electron$/i]],
  ["tauri", [/^@tauri-apps\//i]],
] as const

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
  for (const [framework, patterns] of FRAMEWORK_PATTERNS) {
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
): { phase: "init" | "spec" | "plan" | "tasks" | "ready"; nextStep: string } {
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
): "spec" | "plan" | "tasks" | "ready" {
  if (!specOk) return "spec"
  if (!planOk) return "plan"
  if (!tasksOk) return "tasks"
  return "ready"
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
  { pattern: /\bscrap(e|ing)\b|\brate.?limit\b|\bthrottl(e|ing)\b|\brobots\.txt\b/i, score: 1, reason: "external site scraping: fragile to markup drift and anti-bot measures" },
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

  const usedReasons = new Set<string>()
  for (const rule of COMPLEXITY_KEYWORDS) {
    if (rule.pattern.test(taskDescription) && !usedReasons.has(rule.reason)) {
      reasoning.push(rule.reason)
      score += rule.score
      usedReasons.add(rule.reason)
    }
  }

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

  if (hasNewDependencies) {
    reasoning.push("new external dependencies required")
    score += 3
  } else {
    reasoning.push("no new external dependencies")
  }

  if (hasBoundaryAnnotations) {
    reasoning.push("multiple boundaries involved, coordination needed")
    score += 2
  } else {
    reasoning.push("single boundary or no boundary concerns")
  }

  if (hasNeedsClarification) {
    reasoning.push("spec has unresolved [NEEDS CLARIFICATION] markers")
    score += 2
  } else {
    reasoning.push("spec is clear with no unresolved markers")
  }

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
