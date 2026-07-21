import { tool } from "@opencode-ai/plugin"
import {
  assessComplexity,
  discoverProject,
  isValidProjectRoot,
} from "./shared/types"

export default tool({
  description: "Assess task complexity and return simple/standard/complex routing",
  args: {
    taskDescription: tool.schema.string().describe("Task description to evaluate"),
    filesAffected: tool.schema.number().optional().describe("Estimated number of files affected"),
    hasNewDependencies: tool.schema.boolean().optional().describe("Whether task introduces new external dependencies"),
    hasBoundaryAnnotations: tool.schema.boolean().optional().describe("Whether task involves multiple _Boundary: annotations"),
    hasNeedsClarification: tool.schema.boolean().optional().describe("Whether spec has [NEEDS CLARIFICATION] markers"),
    useProjectContext: tool.schema.boolean().optional().describe("Whether to enrich assessment with auto-detected project context"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!await isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }

      const filesAffected = args.filesAffected ?? 1
      const hasNewDeps = args.hasNewDependencies ?? false
      const hasBoundary = args.hasBoundaryAnnotations ?? false
      const hasClarification = args.hasNeedsClarification ?? false

      let projectContext = undefined
      if (args.useProjectContext) {
        projectContext = await discoverProject(projectRoot)
      }

      const result = await assessComplexity(
        args.taskDescription ?? "",
        filesAffected,
        hasNewDeps,
        hasBoundary,
        hasClarification,
        projectContext,
      )

      return {
        title: `Complexity: ${result.level}`,
        output: `${result.level} (score: ${result.score})`,
        metadata: {
          level: result.level,
          score: result.score,
          reasoning: result.reasoning,
          filesAffected,
          hasNewDependencies: hasNewDeps,
          hasBoundaryAnnotations: hasBoundary,
          hasNeedsClarification: hasClarification,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `complexity: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
