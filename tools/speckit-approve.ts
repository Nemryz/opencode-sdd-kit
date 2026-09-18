import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import {
  exists,
  getLatestFeatureDir,
  getProjectRootWarnings,
  isValidProjectRoot,
  readSession,
  readSpecJson,
  specsDirPath,
  syncFrontmatterFromSpecJson,
  writeSession,
  writeSpecJson,
} from "./shared/types"

const ARTIFACT_FILES: Record<string, string> = {
  spec: "spec.md",
  plan: "plan.md",
  tasks: "tasks.md",
}

const ARTIFACT_NEXT_STEPS: Record<string, string> = {
  spec: "/plan <tech stack>",
  plan: "/tasks",
  tasks: "/impl or /review",
}

export default tool({
  description: "Approve a generated artifact so the workflow can advance to the next phase",
  args: {
    artifact: tool.schema.enum(["spec", "plan", "tasks"]).optional().describe("Artifact to approve"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!await isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }
      const projectWarnings = await getProjectRootWarnings(projectRoot)
      if (projectWarnings.length > 0) {
        return {
          title: "Warning",
          output: projectWarnings.map(w => w.message).join("\n\n"),
          metadata: { warnings: projectWarnings, requiresConfirmation: true },
        }
      }

      if (!args.artifact) {
        return { title: "Error", output: "Artifact required. Usage: /approve spec | /approve plan | /approve tasks" }
      }
      const artifact = args.artifact

      const session = await readSession(projectRoot)
      const featureDir = session.featureDir ?? await getLatestFeatureDir(projectRoot)
      if (!featureDir) {
        return { title: "Error", output: "No feature found. Run /spec first." }
      }

      const base = path.join(specsDirPath(projectRoot), featureDir)
      const specJson = await readSpecJson(base)
      if (!specJson) {
        return { title: "Error", output: `spec.json not found in specs/${featureDir}` }
      }

      const artifactFile = ARTIFACT_FILES[artifact]
      if (!await exists(path.join(base, artifactFile))) {
        return { title: "Error", output: `${artifactFile} does not exist in specs/${featureDir}. Generate it first.` }
      }

      if (specJson.approvals[artifact].approved) {
        return {
          title: `${artifact} already approved`,
          output: `${artifact} is already approved for ${featureDir}.`,
          metadata: { artifact, featureDir },
        }
      }

      specJson.approvals[artifact].approved = true
      if (artifact === "tasks") {
        specJson.phase = "ready"
        specJson.ready_for_implementation = true
      }
      await writeSpecJson(specJson, base)
      await syncFrontmatterFromSpecJson(base, specJson)

      const nextStep = ARTIFACT_NEXT_STEPS[artifact]
      await writeSession(projectRoot, {
        ...session,
        command: "/approve",
        phase: session.phase,
        featureDir,
        nextStep,
        lastResult: `${artifact} approved for ${featureDir}`,
        history: [...session.history, `/approve ${artifact}`],
      })

      return {
        title: `${artifact} approved`,
        output: `${artifact} approved for ${featureDir}  Next: ${nextStep}`,
        metadata: { artifact, featureDir, nextStep },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `approve: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
