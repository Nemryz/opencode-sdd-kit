import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"

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
      const latest = session.featureDir && dirs.includes(session.featureDir)
        ? session.featureDir
        : dirs.length > 0 ? dirs[dirs.length - 1] : null

      let phase: string, nextStep: string

      if (latest) {
        const base = path.join(projectRoot, "specs", latest)
        const specOk = await exists(path.join(base, "spec.md"))
        const planOk = await exists(path.join(base, "plan.md"))
        const tasksOk = await exists(path.join(base, "tasks.md"))
        ;({ phase, nextStep } = detectPhase(specOk, planOk, tasksOk, constitutionExists))
      } else {
        ;({ phase, nextStep } = detectPhase(false, false, false, constitutionExists))
      }

      session.command = "/status"
      session.phase = phase
      session.featureDir = latest || session.featureDir
      session.nextStep = nextStep
      session.lastResult = `Phase: ${phase} | ${dirs.length} features`
      session.history.push("/status")
      if (session.history.length > 20) session.history = session.history.slice(-20)
      await writeSession(projectRoot, session)

      const line = dirs.length === 0
        ? "No features yet. Next: /spec <description>"
        : `Phase: ${phase} | ${dirs.length} feature(s)${latest ? " | Latest: " + latest : ""} | Next: ${nextStep}`

      return {
        title: `Status: ${phase}`,
        output: line,
        metadata: {
          phase,
          featureCount: dirs.length,
          features: dirs,
          latestFeature: latest,
          constitutionExists,
          nextCommand: nextStep,
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
