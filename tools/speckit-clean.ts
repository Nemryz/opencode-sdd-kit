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
  constitutionPath,
  specsDirPath,
  specJsonPath,
  sessionPath,
  parsePhase,
  withLock,
  SpecJsonSchema,
  corruptionWarnings,
  clearCorruptionWarnings,
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
      if (!await isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }
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
      let specJsonMismatches = 0

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
          const isTasksNotApproved = sj.phase === "tasks" && filesPhase === "ready" && !sj.approvals.tasks.approved
          if (sj.phase !== filesPhase && !isTasksNotApproved) {
            issues.push(`${dir}: spec.json phase "${sj.phase}" ≠ reality "${filesPhase}"`)
            specJsonMismatches++
          }
          if (sj.ready_for_implementation && filesPhase !== "ready") {
            issues.push(`${dir}: marked ready_for_implementation but files show phase "${filesPhase}"`)
          }
        }
      }

      if (args.fix) {
        // ── Phase 1: Collect spec.json changes ──
        interface PendingSpecChange {
          base: string
          dir: string
          sj: import("./shared/types").SpecJson
        }
        const specChanges: PendingSpecChange[] = []

        for (const dir of entries) {
          const report = reports.find(r => r.dir === dir)
          if (!report) continue
          const base = path.join(specsDir, dir)
          const sj = await readSpecJson(base)
          if (!sj) continue
          const filesPhase = detectPhaseFromFiles(report.spec, report.plan, report.tasks)
          const isTasksNotApproved = sj.phase === "tasks" && filesPhase === "ready" && !sj.approvals.tasks.approved
          let changed = false
          if (sj.phase !== filesPhase && !isTasksNotApproved) {
            sj.phase = parsePhase(filesPhase)
            changed = true
          }
          const correctRfi = filesPhase === "ready" && sj.approvals.tasks.approved
          if (sj.ready_for_implementation !== correctRfi) {
            sj.ready_for_implementation = correctRfi
            changed = true
          }
          if (changed) {
            specChanges.push({ base, dir, sj })
          }
        }

        // ── Phase 2: Validate all spec.json changes ──
        for (const change of specChanges) {
          const result = SpecJsonSchema.safeParse(change.sj)
          if (!result.success) {
            throw new Error(`/clean --fix: validation failed for ${change.dir}: ${String(result.error)}`)
          }
        }

        // ── Phase 3: Apply all spec.json changes ──
        for (const change of specChanges) {
          await writeSpecJson(change.sj, change.base)
        }

        // ── Phase 4: Collect session.json changes ──
        interface PendingSessionChange {
          field: string
          apply: (s: import("./shared/types").SessionState) => void
        }
        const sessionChanges: PendingSessionChange[] = []

        const s = await readSession(projectRoot)
        for (const dir of entries) {
          const report = reports.find(r => r.dir === dir)
          if (!report) continue
          const base = path.join(specsDir, dir)
          const sj = await readSpecJson(base)
          if (sj) {
            const filesPhase = detectPhaseFromFiles(report.spec, report.plan, report.tasks)
            if (sj.phase !== filesPhase) {
              sessionChanges.push({
                field: `${dir}: phase → ${filesPhase}`,
                apply: () => {},
              })
            }
          }
        }

        if (s.featureDir) {
          const stillExists = reports.some(r => r.dir === s.featureDir)
          if (!stillExists) {
            const newDir = reports.length > 0 ? reports[reports.length - 1].dir : null
            sessionChanges.push({
              field: "featureDir",
              apply: (sess) => {
                sess.featureDir = newDir
                sess.featureNumber = newDir ? parseNNN(newDir) : null
                sess.featureName = null
              },
            })
          }
        } else if (reports.length > 0) {
          const newDir = reports[reports.length - 1].dir
          sessionChanges.push({
            field: "featureDir (assigned)",
            apply: (sess) => {
              sess.featureDir = newDir
              sess.featureNumber = parseNNN(newDir)
            },
          })
        }

        if (s.featureNumber != null && s.featureDir) {
          const expected = parseNNN(s.featureDir)
          if (s.featureNumber !== expected) {
            sessionChanges.push({
              field: "featureNumber",
              apply: (sess) => { sess.featureNumber = expected },
            })
          }
        }

        if (s.featureDir) {
          const report = reports.find(r => r.dir === s.featureDir)
          if (report) {
            const constitutionExists = await exists(constitutionPath(projectRoot))
            const { phase: filesPhase, nextStep: expectedNext } = detectPhase(
              report.spec, report.plan, report.tasks, constitutionExists,
            )
            if (s.phase !== filesPhase) {
              sessionChanges.push({
                field: "session phase",
                apply: (sess) => {
                  sess.phase = filesPhase
                  sess.nextStep = expectedNext
                },
              })
            }
          }
        }

        // ── Phase 5: Apply session.json changes ──
        if (sessionChanges.length > 0) {
          s.lastResult = "repaired: " + sessionChanges.map(c => c.field).join(", ")
          s.history.push("/clean")
          if (s.history.length > 20) s.history = s.history.slice(-20)
          await withLock(sessionPath(projectRoot), async () => {
            const liveS = await readSession(projectRoot)
            for (const change of sessionChanges) {
              change.apply(liveS)
            }
            liveS.lastResult = "repaired: " + sessionChanges.map(c => c.field).join(", ")
            liveS.history.push("/clean")
            if (liveS.history.length > 20) liveS.history = liveS.history.slice(-20)
            await writeSession(projectRoot, liveS)
          })
        }
      }

      for (const w of corruptionWarnings) {
        issues.push(`[corruption] ${w.file}: ${w.message}`)
      }
      clearCorruptionWarnings()

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
