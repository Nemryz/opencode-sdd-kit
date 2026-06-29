import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"

interface ApprovalState {
  generated: boolean
  approved: boolean
}

interface SpecJson {
  feature_name: string
  feature_number: number
  created_at: string
  updated_at: string
  phase: "spec" | "plan" | "tasks" | "ready" | "impl" | "complete"
  approvals: {
    spec: ApprovalState
    plan: ApprovalState
    tasks: ApprovalState
  }
  ready_for_implementation: boolean
}

function specJsonPath(featureDir: string): string {
  return path.join(featureDir, "spec.json")
}

async function readSpecJson(featureDir: string): Promise<SpecJson | null> {
  try {
    const data = await fs.readFile(specJsonPath(featureDir), "utf-8")
    return JSON.parse(data) as SpecJson
  } catch {
    return null
  }
}

interface SessionState {
  command: string | null
  phase: string
  featureDir: string | null
  featureNumber: number | null
  featureName: string | null
  nextStep: string | null
  lastResult: string | null
  history: string[]
}

const DEFAULT_SESSION: SessionState = {
  command: null,
  phase: "init",
  featureDir: null,
  featureNumber: null,
  featureName: null,
  nextStep: "/spec <description>",
  lastResult: null,
  history: [],
}

function sessionPath(root: string): string {
  return path.join(root, ".opencode", "spec-memory", "session.json")
}

async function readSession(root: string): Promise<SessionState> {
  try {
    const data = await fs.readFile(sessionPath(root), "utf-8")
    return { ...DEFAULT_SESSION, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_SESSION }
  }
}

async function writeSession(root: string, s: SessionState): Promise<void> {
  const dir = path.join(root, ".opencode", "spec-memory")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(sessionPath(root), JSON.stringify(s, null, 2), "utf-8")
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function parseNNN(dirName: string): number {
  const match = dirName.match(/^(\d+)-/)
  return match ? parseInt(match[1], 10) : 0
}

function detectPhase(specOk: boolean, planOk: boolean, tasksOk: boolean, constitutionExists: boolean): { phase: string; nextStep: string } {
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

async function getFeatureDirs(projectRoot: string): Promise<string[]> {
  const specsDir = path.join(projectRoot, "specs")
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true })
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

export default tool({
  description: "Show the current Spec-Driven Development workflow state across all features",
  args: {},
  async execute(_args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      const session = await readSession(projectRoot)
      const constitutionExists = await exists(path.join(projectRoot, ".opencode", "spec-memory", "constitution.md"))
      const dirs = await getFeatureDirs(projectRoot)

      const featurePhases: { dir: string; phase: string }[] = []
      const phaseCounts: Record<string, number> = {}
      let latest = session.featureDir && dirs.includes(session.featureDir)
        ? session.featureDir
        : dirs.length > 0 ? dirs[dirs.length - 1] : null

      for (const dir of dirs) {
        const base = path.join(projectRoot, "specs", dir)
        const sj = await readSpecJson(base)
        const specOk = await exists(path.join(base, "spec.md"))
        const planOk = await exists(path.join(base, "plan.md"))
        const tasksOk = await exists(path.join(base, "tasks.md"))

        let phase: string
        if (sj) {
          phase = sj.phase
        } else {
          ;({ phase } = detectPhase(specOk, planOk, tasksOk, constitutionExists))
        }
        featurePhases.push({ dir, phase })
        phaseCounts[phase] = (phaseCounts[phase] || 0) + 1
      }

      const latestPhase = latest
        ? (featurePhases.find(f => f.dir === latest)?.phase ?? "unknown")
        : "none"
      const summary = dirs.length === 0
        ? "No features yet."
        : `Features: ${dirs.length} | ` + Object.entries(phaseCounts)
            .map(([p, c]) => `${p}: ${c}`)
            .join(", ")

      session.command = "/status"
      session.phase = latestPhase
      session.featureDir = latest || session.featureDir
      const nextStepMap: Record<string, string> = {
        init: "/spec <description>",
        spec: "/plan <tech stack>",
        plan: "/tasks",
        tasks: "/tasks (approve) or /impl",
        ready: "/impl or /review",
        impl: "/impl (continue)",
        complete: "/review or start a new feature",
      }
      session.nextStep = nextStepMap[session.phase] ?? "/spec <description>"
      session.lastResult = summary
      session.history.push("/status")
      if (session.history.length > 20) session.history = session.history.slice(-20)
      await writeSession(projectRoot, session)

      const dashboard = featurePhases.map(f => `${f.dir} (${f.phase})`).join("  ")
      const line = dirs.length === 0
        ? "No features yet. Next: /spec <description>"
        : `${summary}  ${dashboard}`

      return {
        title: `Status: ${dirs.length} feature(s)`,
        output: line,
        metadata: {
          phase: latestPhase,
          featureCount: dirs.length,
          features: featurePhases.map(f => ({ dir: f.dir, phase: f.phase })),
          latestFeature: latest,
          constitutionExists,
          phaseCounts,
          nextCommand: session.nextStep,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `status: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
