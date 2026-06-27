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

export default tool({
  description: "Scan all feature directories and report inconsistencies in artifact states",
  args: {
    fix: tool.schema.boolean().optional().describe("Auto-fix session.json to match reality (does not create/delete artifacts)"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      const specsDir = path.join(projectRoot, "specs")
      let entries: string[] = []
      try {
        entries = (await fs.readdir(specsDir, { withFileTypes: true }))
          .filter(e => e.isDirectory())
          .map(e => e.name)
          .filter(n => parseNNN(n) > 0)
          .sort()
      } catch {
        return {
          title: "No features",
          output: "No feature directories found in specs/",
          metadata: { features: [], issues: [] },
        }
      }

      interface FeatureReport {
        dir: string
        nnn: number
        spec: boolean
        plan: boolean
        tasks: boolean
        status: "ok" | "incomplete" | "orphan"
      }

      const reports: FeatureReport[] = []
      const issues: string[] = []

      for (const dir of entries) {
        const base = path.join(specsDir, dir)
        const specOk = await exists(path.join(base, "spec.md"))
        const planOk = await exists(path.join(base, "plan.md"))
        const tasksOk = await exists(path.join(base, "tasks.md"))

        let status: "ok" | "incomplete" | "orphan"
        if (specOk && planOk && tasksOk) {
          status = "ok"
        } else if (!specOk && !planOk && !tasksOk) {
          status = "orphan"
        } else {
          status = "incomplete"
        }

        const report: FeatureReport = {
          dir,
          nnn: parseNNN(dir),
          spec: specOk,
          plan: planOk,
          tasks: tasksOk,
          status,
        }
        reports.push(report)

        if (status === "incomplete") {
          const missing: string[] = []
          if (!specOk) missing.push("spec")
          if (!planOk) missing.push("plan")
          if (!tasksOk) missing.push("tasks")
          if (missing.length > 0) {
            issues.push(`${dir}: missing ${missing.join(", ")}`)
          }
        } else if (status === "orphan") {
          issues.push(`${dir}: empty directory (no artifacts)`)
        }
      }

      if (args.fix) {
        const session = await readSession(projectRoot)
        const fixedFields: string[] = []

        if (session.featureDir) {
          const stillExists = reports.some(r => r.dir === session.featureDir)
          if (!stillExists) {
            session.featureDir = reports.length > 0 ? reports[reports.length - 1].dir : null
            session.featureNumber = session.featureDir ? parseNNN(session.featureDir) : null
            session.featureName = null
            fixedFields.push("featureDir")
          }
        } else if (reports.length > 0) {
          session.featureDir = reports[reports.length - 1].dir
          session.featureNumber = parseNNN(session.featureDir)
          fixedFields.push("featureDir (asignado)")
        }

        if (session.featureNumber && session.featureDir) {
          const expected = parseNNN(session.featureDir)
          if (session.featureNumber !== expected) {
            session.featureNumber = expected
            fixedFields.push("featureNumber")
          }
        }

        if (session.featureDir) {
          const report = reports.find(r => r.dir === session.featureDir)
          if (report) {
            let expectedPhase: string, expectedNext: string
            if (!report.spec) {
              expectedPhase = "spec"; expectedNext = "/spec <description>"
            } else if (!report.plan) {
              expectedPhase = "plan"; expectedNext = "/plan <tech stack>"
            } else if (!report.tasks) {
              expectedPhase = "tasks"; expectedNext = "/tasks"
            } else {
              expectedPhase = "ready"; expectedNext = "/impl or /review"
            }
            if (session.phase !== expectedPhase) {
              session.phase = expectedPhase
              session.nextStep = expectedNext
              fixedFields.push("phase")
            }
          }
        }

        if (fixedFields.length > 0) {
          session.lastResult = "session.json repaired: " + fixedFields.join(", ")
          session.history.push("/clean")
          if (session.history.length > 20) session.history = session.history.slice(-20)
          await writeSession(projectRoot, session)
        }
      }

      const summary = issues.length === 0
        ? "All features consistent"
        : `${issues.length} issue(s) detected`

      const okCount = reports.filter(r => r.status === "ok").length
      const incompleteCount = reports.filter(r => r.status === "incomplete").length
      const orphanCount = reports.filter(r => r.status === "orphan").length

      return {
        title: `Clean: ${reports.length} features, ${issues.length} issues`,
        output: `${summary}  Next: /status`,
        metadata: {
          total: reports.length,
          ok: okCount,
          incomplete: incompleteCount,
          orphan: orphanCount,
          issues,
          reports: reports.map(r => ({
            dir: r.dir,
            status: r.status,
            artifacts: { spec: r.spec, plan: r.plan, tasks: r.tasks },
          })),
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `clean: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
