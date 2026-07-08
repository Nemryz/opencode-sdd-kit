import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"
import {
  readSpecJson,
  writeSpecJson,
  exists,
  getFeatureDirs,
  isValidProjectRoot,
  constitutionPath,
  specsDirPath,
  steeringDirPath,
  specJsonPath,
  PATHS,
  detectPhaseFromFiles,
  parsePhase,
  withLock,
} from "./shared/types"

interface AuditFinding {
  severity: "info" | "warn" | "error"
  category: string
  message: string
  file?: string
}

interface AuditReport {
  passed: boolean
  findings: AuditFinding[]
  summary: { info: number; warn: number; error: number }
}

async function auditFeature(
  projectRoot: string,
  dirName: string,
  findings: AuditFinding[],
): Promise<void> {
  const base = path.join(specsDirPath(projectRoot), dirName)
  const specOk = await exists(path.join(base, "spec.md"))
  const planOk = await exists(path.join(base, "plan.md"))
  const tasksOk = await exists(path.join(base, "tasks.md"))
  const dataModelOk = await exists(path.join(base, "data-model.md"))
  const researchOk = await exists(path.join(base, "research.md"))
  const contractsOk = await exists(path.join(base, "contracts"))

  const sj = await readSpecJson(base)

  if (!sj) {
    findings.push({
      severity: "warn",
      category: "spec-json",
      message: `No spec.json found for ${dirName}`,
      file: path.join(base, "spec.json"),
    })
    return
  }

  if (sj.phase !== "complete" && sj.phase !== "impl") {
    if (sj.phase === "ready" && !(specOk && planOk && tasksOk)) {
      findings.push({
        severity: "error",
        category: "phase-mismatch",
        message: `${dirName}: spec.json says ready but files missing (spec=${specOk}, plan=${planOk}, tasks=${tasksOk})`,
        file: path.join(base, "spec.json"),
      })
    } else if (sj.phase === "tasks" && !tasksOk) {
      findings.push({
        severity: "error",
        category: "phase-mismatch",
        message: `${dirName}: spec.json says tasks but tasks.md missing`,
        file: path.join(base, "spec.json"),
      })
    } else if (sj.phase === "plan" && !planOk) {
      findings.push({
        severity: "error",
        category: "phase-mismatch",
        message: `${dirName}: spec.json says plan but plan.md missing`,
        file: path.join(base, "spec.json"),
      })
    } else if (sj.phase === "spec" && !specOk) {
      findings.push({
        severity: "error",
        category: "phase-mismatch",
        message: `${dirName}: spec.json says spec but spec.md missing`,
        file: path.join(base, "spec.json"),
      })
    }
  }

  if (!sj.approvals.spec.generated && specOk) {
    findings.push({
      severity: "info",
      category: "approval",
      message: `${dirName}: spec.md exists but spec approval not marked generated`,
      file: path.join(base, "spec.json"),
    })
  }
  if (!sj.approvals.plan.generated && planOk) {
    findings.push({
      severity: "info",
      category: "approval",
      message: `${dirName}: plan.md exists but plan approval not marked generated`,
      file: path.join(base, "spec.json"),
    })
  }
  if (!sj.approvals.tasks.generated && tasksOk) {
    findings.push({
      severity: "info",
      category: "approval",
      message: `${dirName}: tasks.md exists but tasks approval not marked generated`,
      file: path.join(base, "spec.json"),
    })
  }

  if (sj.approvals.spec.approved && !sj.approvals.plan.generated && planOk) {
    findings.push({
      severity: "warn",
      category: "approval-order",
      message: `${dirName}: spec approved but plan not transitioned to generated`,
      file: path.join(base, "spec.json"),
    })
  }

  if (sj.ready_for_implementation && !(specOk && planOk && tasksOk)) {
    findings.push({
      severity: "error",
      category: "ready-violation",
      message: `${dirName}: marked ready_for_implementation but artifacts incomplete`,
      file: path.join(base, "spec.json"),
    })
  }

  if (specOk) {
    const specContent = await fs.readFile(path.join(base, "spec.md"), "utf-8").catch(() => "")
    if (specContent.includes("[NEEDS CLARIFICATION]")) {
      findings.push({
        severity: "warn",
        category: "spec-clarity",
        message: `${dirName}: spec.md contains unresolved [NEEDS CLARIFICATION] markers`,
        file: path.join(base, "spec.md"),
      })
    }
  }

  if (tasksOk) {
    const tasksContent = await fs.readFile(path.join(base, "tasks.md"), "utf-8").catch(() => "")
    const lines = tasksContent.split("\n")
    const hasBoundary = lines.some(l => l.includes("Boundary:"))
    if (!hasBoundary) {
      findings.push({
        severity: "info",
        category: "tasks-boundary",
        message: `${dirName}: tasks.md has no Boundary annotations`,
        file: path.join(base, "tasks.md"),
      })
    }
  }

  if (researchOk) {
    findings.push({
      severity: "info",
      category: "optional-artifact",
      message: `${dirName}: has research.md`,
      file: path.join(base, "research.md"),
    })
  }
  if (dataModelOk) {
    findings.push({
      severity: "info",
      category: "optional-artifact",
      message: `${dirName}: has data-model.md`,
      file: path.join(base, "data-model.md"),
    })
  }
  if (contractsOk) {
    findings.push({
      severity: "info",
      category: "optional-artifact",
      message: `${dirName}: has contracts/ directory`,
      file: path.join(base, "contracts"),
    })
  }
}

async function auditProject(projectRoot: string): Promise<AuditReport> {
  const findings: AuditFinding[] = []

  const constitutionExists = await exists(constitutionPath(projectRoot))
  if (!constitutionExists) {
    findings.push({
      severity: "warn",
      category: "constitution",
      message: "Constitution file missing in .opencode/spec-memory/",
      file: constitutionPath(projectRoot),
    })
  } else {
    findings.push({
      severity: "info",
      category: "constitution",
      message: "Constitution file present",
      file: constitutionPath(projectRoot),
    })
  }

  const steeringDir = steeringDirPath(projectRoot)
  const steeringExists = await exists(steeringDir)
  if (steeringExists) {
    const entries = await fs.readdir(steeringDir).catch(() => [])
    if (entries.length === 0) {
      findings.push({
        severity: "warn",
        category: "steering",
        message: "Steering directory exists but is empty",
        file: steeringDir,
      })
    } else {
      const productOk = await exists(path.join(steeringDir, PATHS.PRODUCT_STEERING_FILE))
      const techOk = await exists(path.join(steeringDir, PATHS.TECH_STEERING_FILE))
      const structureOk = await exists(path.join(steeringDir, PATHS.STRUCTURE_STEERING_FILE))
      if (!productOk) {
        findings.push({ severity: "info", category: "steering", message: "Steering missing product.md", file: steeringDir })
      }
      if (!techOk) {
        findings.push({ severity: "info", category: "steering", message: "Steering missing tech.md", file: steeringDir })
      }
      if (!structureOk) {
        findings.push({ severity: "info", category: "steering", message: "Steering missing structure.md", file: steeringDir })
      }
      if (productOk && techOk && structureOk) {
        findings.push({ severity: "info", category: "steering", message: "Full steering context present" })
      }
    }
  } else {
    findings.push({ severity: "info", category: "steering", message: "No steering directory (optional)" })
  }

  const featureDirs = await getFeatureDirs(projectRoot)
  if (featureDirs.length === 0) {
    findings.push({
      severity: "info",
      category: "features",
      message: "No feature directories found",
    })
  } else {
    findings.push({
      severity: "info",
      category: "features",
      message: `${featureDirs.length} feature(s) found: ${featureDirs.join(", ")}`,
    })
    for (const dir of featureDirs) {
      await auditFeature(projectRoot, dir, findings)
    }
  }

  const summary = { info: 0, warn: 0, error: 0 }
  for (const f of findings) {
    summary[f.severity]++
  }

  const passed = summary.error === 0

  return { passed, findings, summary }
}

export default tool({
  description: "Run a comprehensive audit of the project for phase consistency, artifact health, and configuration issues",
  args: {
    fix: tool.schema.boolean().optional().describe("Attempt auto-fix for detected issues"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!await isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }

      const report = await auditProject(projectRoot)

      if (args.fix && report.findings.length > 0) {
        let fixedCount = 0
        for (const finding of report.findings) {
          if (finding.severity === "error" && finding.category === "phase-mismatch") {
            const sjPath = finding.file
            if (sjPath && sjPath.endsWith("spec.json")) {
              const base = path.dirname(sjPath)
              const specOk = await exists(path.join(base, "spec.md"))
              const planOk = await exists(path.join(base, "plan.md"))
              const tasksOk = await exists(path.join(base, "tasks.md"))
              const newPhase = detectPhaseFromFiles(specOk, planOk, tasksOk)
              await withLock(specJsonPath(base), async () => {
                const sjPrev = await readSpecJson(base)
                if (sjPrev && sjPrev.phase !== newPhase) {
                  sjPrev.phase = parsePhase(newPhase)
                  await writeSpecJson(sjPrev, base)
                  finding.message += " (auto-fixed)"
                  fixedCount++
                }
              })
            }
          } else if (finding.severity === "error" && finding.category === "ready-violation") {
            const sjPath = finding.file
            if (sjPath && sjPath.endsWith("spec.json")) {
              const base = path.dirname(sjPath)
              await withLock(specJsonPath(base), async () => {
                const sjPrev = await readSpecJson(base)
                if (sjPrev && sjPrev.ready_for_implementation) {
                  sjPrev.ready_for_implementation = false
                  await writeSpecJson(sjPrev, base)
                  finding.message += " (auto-fixed)"
                  fixedCount++
                }
              })
            }
          } else if (finding.severity === "info" && finding.category === "approval") {
            const sjPath = finding.file
            if (sjPath && sjPath.endsWith("spec.json")) {
              const base = path.dirname(sjPath)
              await withLock(specJsonPath(base), async () => {
                const sjPrev = await readSpecJson(base)
                if (sjPrev) {
                  let changed = false
                  if (!sjPrev.approvals.spec.generated && finding.message.includes("spec")) {
                    sjPrev.approvals.spec.generated = true
                    changed = true
                  }
                  if (!sjPrev.approvals.plan.generated && finding.message.includes("plan")) {
                    sjPrev.approvals.plan.generated = true
                    changed = true
                  }
                  if (!sjPrev.approvals.tasks.generated && finding.message.includes("tasks")) {
                    sjPrev.approvals.tasks.generated = true
                    changed = true
                  }
                  if (changed) {
                    await writeSpecJson(sjPrev, base)
                    finding.message += " (auto-fixed)"
                    fixedCount++
                  }
                }
              })
            }
          }
        }
        if (fixedCount > 0) {
          report.summary.error -= fixedCount
          if (report.summary.error < 0) report.summary.error = 0
          report.passed = report.summary.error === 0
        }
      }

      const lines: string[] = []
      for (const f of report.findings) {
        const tag = f.severity === "error" ? "ERR" : f.severity === "warn" ? "WRN" : "INF"
        lines.push(`[${tag}] ${f.category}: ${f.message}`)
      }

      const status = report.passed ? "PASS" : "FAIL"
      const output = lines.length === 0
        ? `Audit: ${status} | No findings`
        : `Audit: ${status} | ${report.summary.error} error(s), ${report.summary.warn} warning(s), ${report.summary.info} info\n` + lines.join("\n")

      return {
        title: `Audit: ${report.summary.error + report.summary.warn} issue(s)`,
        output,
        metadata: {
          passed: report.passed,
          errorCount: report.summary.error,
          warnCount: report.summary.warn,
          infoCount: report.summary.info,
          findings: report.findings,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `audit: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
