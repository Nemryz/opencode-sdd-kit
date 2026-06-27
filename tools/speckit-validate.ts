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

async function getLatestFeatureDir(projectRoot: string): Promise<string | null> {
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
    dirs.sort((a, b) => b.nnn - a.nnn)
    return dirs.length > 0 ? dirs[0].name : null
  } catch {
    return null
  }
}

export default tool({
  description: "Validate that required SDD artifacts exist and determine current workflow phase",
  args: {
    featureDir: tool.schema.string().optional().describe("Specific feature directory to validate (defaults to latest)"),
    command: tool.schema.string().optional().describe("Command name that triggered this validation (e.g., plan, tasks, impl)"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      const session = await readSession(projectRoot)
      const featureDir = args.featureDir || session.featureDir || (await getLatestFeatureDir(projectRoot))
      const constitutionExists = await exists(path.join(projectRoot, ".opencode", "spec-memory", "constitution.md"))

      let specOk = false
      let planOk = false
      let tasksOk = false
      let specJson: SpecJson | null = null
      let specJsonPhase: string | null = null
      let mismatch = false

      if (featureDir) {
        const base = path.join(projectRoot, "specs", featureDir)
        specOk = await exists(path.join(base, "spec.md"))
        planOk = await exists(path.join(base, "plan.md"))
        tasksOk = await exists(path.join(base, "tasks.md"))
        specJson = await readSpecJson(base)
        if (specJson) {
          specJsonPhase = specJson.phase
          const filesOk = specOk && planOk && tasksOk
          if (specJson.phase === "ready" && !filesOk) {
            mismatch = true
          } else if (specJson.phase === "spec" && (planOk || tasksOk)) {
            mismatch = true
          } else if (specJson.phase === "plan" && !planOk) {
            mismatch = true
          } else if (specJson.phase === "tasks" && !tasksOk) {
            mismatch = true
          }
        }
      }

      const parts: string[] = []
      if (!constitutionExists) parts.push("constitution missing")
      if (featureDir) {
        if (specJsonPhase) {
          parts.push(`spec.json phase: ${specJsonPhase}`)
        }
        parts.push(specOk ? "spec ok" : "spec missing")
        parts.push(planOk ? "plan ok" : "plan missing")
        parts.push(tasksOk ? "tasks ok" : "tasks missing")
        if (mismatch) {
          parts.push("WARN: spec.json phase ≠ reality")
        }
      } else {
        parts.push("no features")
      }

      let phase: string, nextStep: string
      if (!featureDir) {
        phase = "empty"
        nextStep = constitutionExists ? "/spec <description>" : "create constitution.md first"
      } else if (specJsonPhase && !mismatch) {
        phase = specJsonPhase
        if (phase === "spec") nextStep = "/plan <tech stack>"
        else if (phase === "plan") nextStep = "/tasks"
        else if (phase === "tasks") nextStep = "/tasks (approve) or /impl"
        else if (phase === "ready") nextStep = "/impl or /review"
        else if (phase === "impl") nextStep = "/impl (continue)"
        else nextStep = "/review"
      } else {
        ;({ phase, nextStep } = detectPhase(specOk, planOk, tasksOk, constitutionExists))
      }

      session.command = args.command ? "/" + args.command : "/review"
      session.phase = phase
      session.featureDir = featureDir || session.featureDir
      session.nextStep = nextStep
      session.lastResult = parts.join(" | ")
      session.history.push(args.command ? "/" + args.command : "/review")
      if (session.history.length > 20) session.history = session.history.slice(-20)

      if (!args.command) {
        await writeSession(projectRoot, session)
      }

      const valid = phase === "ready"

      return {
        title: valid ? "Ready to implement" : "Phase: " + phase,
        output: parts.join(" | ") + " | Next: " + nextStep,
        metadata: {
          valid,
          phase,
          specJsonPhase: specJsonPhase ?? null,
          mismatch,
          nextCommand: nextStep,
          featureDir: featureDir ?? null,
          artifacts: { constitution: constitutionExists, spec: specOk, plan: planOk, tasks: tasksOk },
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `validate: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
