import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import {
  readSession,
  writeSession,
  readSpecJson,
  exists,
  detectPhase,
  getLatestFeatureDir,
  SpecJson,
  PHASE_NEXT_STEP,
  constitutionPath,
  specsDirPath,
} from "./shared/types"

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
      const constitutionExists = await exists(constitutionPath(projectRoot))

      let specOk = false
      let planOk = false
      let tasksOk = false
      let specJson: SpecJson | null = null
      let specJsonPhase: string | null = null
      let mismatch = false

      if (featureDir) {
        const base = path.join(specsDirPath(projectRoot), featureDir)
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
          } else if ((specJson.phase === "impl" || specJson.phase === "complete") && !filesOk) {
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
        nextStep = PHASE_NEXT_STEP[phase] ?? "/review"
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

      await writeSession(projectRoot, session)

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
