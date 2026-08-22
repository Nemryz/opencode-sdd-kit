import { tool } from "@opencode-ai/plugin"
import {
  runHealthCheck,
  readConfigWithRestore,
  findLatestValidBackup,
  acquireLock,
  releaseLock,
  writeSession,
  writeConfigWithBackup,
  clearCorruptionWarnings,
  corruptionWarnings,
  isValidProjectRoot,
  getProjectRootWarnings,
  detectParentProjectWithoutSession,
  sessionPath,
  configPath,
  specsDirPath,
  specJsonPath,
  SessionStateSchema,
  ConfigSchema,
  SpecJsonSchema,
} from "./shared/types"
import path from "node:path"
import fs from "node:fs/promises"
import { exists } from "./shared/types"

export default tool({
  description: "Run health check, analyze findings, and apply fixes with auto-rollback protection",
  args: {
    fix: tool.schema.boolean().optional().describe("Apply auto-fixes for detected issues"),
  },
  async execute(args, context) {
    clearCorruptionWarnings()
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
      const parentProject = await detectParentProjectWithoutSession(projectRoot)
      if (parentProject) {
        return {
          title: "Warning",
          output: `Parent project detected at ${parentProject} without session. Do you want to continue?`,
          metadata: { parentProject, requiresConfirmation: true },
        }
      }

      const report = await runHealthCheck(projectRoot)

      if (args.fix) {
        let fixedCount = 0

        // Fix session.json
        if (report.session.status === "corrupted" || report.session.status === "missing") {
          const restored = await findLatestValidBackup(report.session.file, projectRoot, SessionStateSchema)
          if (restored) {
            await writeSession(projectRoot, restored)
            report.session.status = "restored"
            fixedCount++
          }
        }

        // Fix config.json
        if (report.config.status === "corrupted" || report.config.status === "missing") {
          const restored = await findLatestValidBackup(report.config.file, projectRoot, ConfigSchema)
          if (restored) {
            await writeConfigWithBackup(projectRoot, restored)
            report.config.status = "restored"
            fixedCount++
          }
        }

        // Fix features
        const sDir = specsDirPath(projectRoot)
        for (const feature of report.features) {
          if (feature.spec_json === "corrupted" || feature.spec_json === "missing") {
            const base = path.join(sDir, feature.dir)
            const sjFp = specJsonPath(base)
            const restored = await findLatestValidBackup(sjFp, projectRoot, SpecJsonSchema)
            if (restored) {
              const { writeSpecJson } = await import("./shared/io")
              await writeSpecJson(restored, base)
              feature.spec_json = "restored"
              fixedCount++
            }
          }
        }

        if (fixedCount > 0) {
          report.overall = report.features.some(f => f.spec_json === "corrupted") || report.session.status === "corrupted" || report.config.status === "corrupted"
            ? "degraded"
            : "healthy"
        }
      }

      const lines: string[] = []
      const sessionTag = report.session.status === "healthy" ? "healthy" : report.session.status === "restored" ? "restored from backup" : report.session.status
      lines.push(`  session.json: ${sessionTag}`)

      const configTag = report.config.status === "healthy" ? "healthy" : report.config.status === "restored" ? "restored from backup" : report.config.status
      lines.push(`  config.json: ${configTag}`)

      const healthyFeatures = report.features.filter(f => f.spec_json === "healthy").length
      const totalFeatures = report.features.length
      lines.push(`  Features: ${healthyFeatures}/${totalFeatures} healthy`)

      for (const feature of report.features) {
        const statusTag = feature.spec_json === "healthy" ? "healthy" : feature.spec_json === "restored" ? `restored from backup (${feature.backups.corrupted} corrupted backup(s))` : feature.spec_json
        const backupInfo = feature.backups.total > 0 ? ` (${feature.backups.total} backups, ${feature.backups.valid} valid)` : ""
        lines.push(`    ${feature.dir}: ${statusTag}${backupInfo}`)
      }

      const corruptionLines = corruptionWarnings.map(w => `  [CORRUPTION] ${w.file}: ${w.message}`)
      clearCorruptionWarnings()

      const overallTag = report.overall === "healthy" ? "HEALTHY" : report.overall === "degraded" ? "DEGRADED" : "CRITICAL"
      const title = `Session Health: ${overallTag}`
      const output = [
        title,
        ...lines,
        ...corruptionLines,
        `  Overall: ${report.overall.toUpperCase()}`,
      ].join("\n")

      return {
        title,
        output,
        metadata: report,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { title: "Error", output: `Health check failed: ${msg}` }
    }
  },
})
