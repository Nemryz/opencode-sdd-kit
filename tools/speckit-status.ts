import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import {
  readSession,
  writeSession,
  readSpecJson,
  exists,
  detectPhase,
  getFeatureDirs,
  isValidProjectRoot,
  PHASE_NEXT_STEP,
  constitutionPath,
  specsDirPath,
  sessionPath,
  withLock,
} from "./shared/types"

export default tool({
  description: "Show the current Spec-Driven Development workflow state across all features",
  args: {},
  async execute(_args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }
      const constitutionExists = await exists(constitutionPath(projectRoot))
      const dirs = await getFeatureDirs(projectRoot)
      const featurePhases: { dir: string; phase: string }[] = []
      const phaseCounts: Record<string, number> = {}
      let latest: string | null = null
      let latestPhase = "none"
      let summary = "No features yet."

      await withLock(sessionPath(projectRoot), async () => {
        const session = await readSession(projectRoot)
        latest = session.featureDir && dirs.includes(session.featureDir)
          ? session.featureDir
          : dirs.length > 0 ? dirs[dirs.length - 1] : null

        for (const dir of dirs) {
          const base = path.join(specsDirPath(projectRoot), dir)
          const sj = await readSpecJson(base)
          const [specOk, planOk, tasksOk] = await Promise.all([
            exists(path.join(base, "spec.md")),
            exists(path.join(base, "plan.md")),
            exists(path.join(base, "tasks.md")),
          ])

          let phase: string
          if (sj) {
            phase = sj.phase
          } else {
            ;({ phase } = detectPhase(specOk, planOk, tasksOk, constitutionExists))
          }
          featurePhases.push({ dir, phase })
          phaseCounts[phase] = (phaseCounts[phase] || 0) + 1
        }

        latestPhase = latest
          ? (featurePhases.find(f => f.dir === latest)?.phase ?? "unknown")
          : "none"
        summary = dirs.length === 0
          ? "No features yet."
          : `Features: ${dirs.length} | ` + Object.entries(phaseCounts)
              .map(([p, c]) => `${p}: ${c}`)
              .join(", ")

        session.command = "/status"
        session.phase = latestPhase
        session.featureDir = latest
        session.nextStep = PHASE_NEXT_STEP[session.phase] ?? "/spec <description>"
        session.lastResult = summary
        session.history.push("/status")
        if (session.history.length > 20) session.history = session.history.slice(-20)
        await writeSession(projectRoot, session)
      })

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
          nextCommand: PHASE_NEXT_STEP[latestPhase] ?? "/spec <description>",
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
