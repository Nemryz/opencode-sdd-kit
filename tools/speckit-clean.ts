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
  specJsonPath,
  sessionPath,
  parsePhase,
  withLock,
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
        for (const dir of entries) {
          const report = reports.find(r => r.dir === dir)
          if (!report) continue
          const base = path.join(specsDir, dir)
          await withLock(specJsonPath(base), async () => {
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
              }
            }
          })
        }

        const session = await withLock(sessionPath(projectRoot), async () => {
          const s = await readSession(projectRoot)
          const fixedFields: string[] = []
          for (const dir of entries) {
            const report = reports.find(r => r.dir === dir)
            if (!report) continue
            const base = path.join(specsDir, dir)
            const sj = await readSpecJson(base)
            if (sj) {
              const filesPhase = detectPhaseFromFiles(report.spec, report.plan, report.tasks)
              if (sj.phase !== filesPhase) {
                fixedFields.push(`${dir}: phase → ${filesPhase}`)
              }
            }
          }

          if (s.featureDir) {
            const stillExists = reports.some(r => r.dir === s.featureDir)
            if (!stillExists) {
              s.featureDir = reports.length > 0 ? reports[reports.length - 1].dir : null
              s.featureNumber = s.featureDir ? parseNNN(s.featureDir) : null
              s.featureName = null
              fixedFields.push("featureDir")
            }
          } else if (reports.length > 0) {
            s.featureDir = reports[reports.length - 1].dir
            s.featureNumber = parseNNN(s.featureDir)
            fixedFields.push("featureDir (assigned)")
          }

          if (s.featureNumber != null && s.featureDir) {
            const expected = parseNNN(s.featureDir)
            if (s.featureNumber !== expected) {
              s.featureNumber = expected
              fixedFields.push("featureNumber")
            }
          }

          if (s.featureDir) {
            const report = reports.find(r => r.dir === s.featureDir)
            if (report) {
              const { phase: filesPhase, nextStep: expectedNext } = detectPhase(
                report.spec, report.plan, report.tasks, true,
              )
              if (s.phase !== filesPhase) {
                s.phase = filesPhase
                s.nextStep = expectedNext
                fixedFields.push("session phase")
              }
            }
          }

          if (fixedFields.length > 0) {
            s.lastResult = "repaired: " + fixedFields.join(", ")
            s.history.push("/clean")
            if (s.history.length > 20) s.history = s.history.slice(-20)
            await writeSession(projectRoot, s)
          }
          return s
        })
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
