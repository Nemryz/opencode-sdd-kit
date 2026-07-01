import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"
import {
  readSession,
  writeSession,
  readSpecJson,
  writeSpecJson,
  exists,
  parseNNN,
  detectPhaseFromFiles,
  detectPhase,
  getFeatureDirs,
  isValidProjectRoot,
  specsDirPath,
  parsePhase,
} from "./shared/types"

export default tool({
  description: "Scan all feature directories and report inconsistencies in artifact states",
  args: {
    fix: tool.schema.boolean().optional().describe("Auto-fix session.json to match reality (does not create/delete artifacts)"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }
      const specsDir = specsDirPath(projectRoot)
      let entries: string[] = []
      try {
        entries = (await fs.readdir(specsDir, { withFileTypes: true }))
          .filter(e => e.isDirectory())
          .map(e => e.name)
          .filter(n => parseNNN(n) > 0)
          .sort((a, b) => parseNNN(a) - parseNNN(b))
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
        const sj = await readSpecJson(base)

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

        if (sj) {
          const filesPhase = detectPhaseFromFiles(specOk, planOk, tasksOk)
          if (sj.phase !== filesPhase) {
            issues.push(`${dir}: spec.json phase "${sj.phase}" ≠ reality "${filesPhase}"`)
          }
          if (sj.ready_for_implementation && filesPhase !== "ready") {
            issues.push(`${dir}: marked ready_for_implementation but files show phase "${filesPhase}"`)
          }
        }
      }

      if (args.fix) {
        const session = await readSession(projectRoot)
        const fixedFields: string[] = []

        for (const dir of entries) {
          const report = reports.find(r => r.dir === dir)
          if (!report) continue
          const base = path.join(specsDir, dir)
          const sj = await readSpecJson(base)

          if (sj) {
            const filesPhase = detectPhaseFromFiles(report.spec, report.plan, report.tasks)
            let changed = false
            if (sj.phase !== filesPhase) {
              sj.phase = parsePhase(filesPhase)
              changed = true
            }
            const correctRfi = filesPhase === "ready" && sj.approvals.tasks.approved
            if (sj.ready_for_implementation !== correctRfi) {
              sj.ready_for_implementation = correctRfi
              changed = true
            }
            if (changed) {
              await writeSpecJson(sj, base)
              fixedFields.push(`${dir}: phase → ${filesPhase}`)
            }
          }
        }

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
          fixedFields.push("featureDir (assigned)")
        }

        if (session.featureNumber != null && session.featureDir) {
          const expected = parseNNN(session.featureDir)
          if (session.featureNumber !== expected) {
            session.featureNumber = expected
            fixedFields.push("featureNumber")
          }
        }

        if (session.featureDir) {
          const report = reports.find(r => r.dir === session.featureDir)
          if (report) {
            const { phase: filesPhase, nextStep: expectedNext } = detectPhase(
              report.spec, report.plan, report.tasks, true,
            )
            if (session.phase !== filesPhase) {
              session.phase = filesPhase
              session.nextStep = expectedNext
              fixedFields.push("session phase")
            }
          }
        }

        if (fixedFields.length > 0) {
          session.lastResult = "repaired: " + fixedFields.join(", ")
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

      const specJsonMismatches = issues.filter(i => i.includes("spec.json")).length

      return {
        title: `Clean: ${reports.length} features, ${issues.length} issues`,
        output: `${summary}  Next: /status`,
        metadata: {
          total: reports.length,
          ok: okCount,
          incomplete: incompleteCount,
          orphan: orphanCount,
          specJsonMismatches,
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
