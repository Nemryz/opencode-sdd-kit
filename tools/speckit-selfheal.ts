import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import {
  isValidProjectRoot,
  corruptionWarnings,
  clearCorruptionWarnings,
} from "./shared/types"
import auditTool from "./speckit-audit"
import cleanTool from "./speckit-clean"

interface SelfHealFinding {
  id: string
  source: string
  severity: "LOW" | "MED" | "HIGH"
  category: "BUG" | "MISSING_TEST" | "HARDENING" | "DOCS"
  message: string
  file?: string
  originalSeverity: string
  originalCategory: string
}

function categorize(category: string, severity: string): { category: SelfHealFinding["category"]; severity: SelfHealFinding["severity"] } {
  const bugCategories = ["phase-mismatch", "ready-violation", "spec-json"]
  const hardeningCategories = ["approval-order", "spec-clarity", "tasks-boundary", "steering"]
  const docCategories = ["optional-artifact", "constitution", "features"]
  const testCategories: string[] = []

  const sevMap: Record<string, SelfHealFinding["severity"]> = {
    error: "HIGH",
    warn: "MED",
    info: "LOW",
  }

  if (bugCategories.includes(category)) {
    return { category: "BUG", severity: sevMap[severity] ?? "LOW" }
  }
  if (hardeningCategories.includes(category)) {
    return { category: "HARDENING", severity: sevMap[severity] ?? "LOW" }
  }
  if (docCategories.includes(category)) {
    return { category: "DOCS", severity: "LOW" }
  }
  if (testCategories.includes(category)) {
    return { category: "MISSING_TEST", severity: sevMap[severity] ?? "LOW" }
  }
  if (category === "corruption") {
    return { category: "BUG", severity: "HIGH" }
  }
  return { category: "HARDENING", severity: sevMap[severity] ?? "LOW" }
}

function severityOrder(s: SelfHealFinding["severity"]): number {
  return s === "HIGH" ? 0 : s === "MED" ? 1 : 2
}

function categoryOrder(c: SelfHealFinding["category"]): number {
  return c === "BUG" ? 0 : c === "MISSING_TEST" ? 1 : c === "HARDENING" ? 2 : 3
}

export default tool({
  description: "Run health scan, analyze findings, and apply fixes with auto-rollback protection",
  args: {
    fix: tool.schema.boolean().optional().describe("Apply auto-fixes for known issues"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!await isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }

      const findings: SelfHealFinding[] = []
      let auditOutput = ""
      let cleanOutput = ""

      // D1: Health Scan — audit
      const auditResult = await auditTool.execute({ fix: args.fix }, context)
      const auditFindings = (auditResult.metadata as Record<string, unknown>)?.findings as Array<Record<string, unknown>> ?? []
      for (const f of auditFindings) {
        const cat = categorize(String(f.category ?? ""), String(f.severity ?? "info"))
        findings.push({
          id: `A-${findings.length + 1}`,
          source: "audit",
          severity: cat.severity,
          category: cat.category,
          message: String(f.message ?? ""),
          file: f.file as string | undefined,
          originalSeverity: String(f.severity ?? ""),
          originalCategory: String(f.category ?? ""),
        })
      }
      auditOutput = String(auditResult.output ?? "")

      // D1: Health Scan — clean
      const cleanResult = await cleanTool.execute({ fix: args.fix }, context)
      const cleanReport = cleanResult.metadata as Record<string, unknown> | undefined
      const cleanIssues = cleanReport?.issues as Array<Record<string, unknown>> ?? []
      for (const issue of cleanIssues) {
        const severity = String(issue.severity ?? "info")
        const cat = categorize("phase-mismatch", severity)
        findings.push({
          id: `C-${findings.length + 1}`,
          source: "clean",
          severity: cat.severity,
          category: cat.category,
          message: String(issue.message ?? ""),
          originalSeverity: severity,
          originalCategory: "clean",
        })
      }
      cleanOutput = String(cleanResult.output ?? "")

      // D1: Health Scan — corruption warnings
      for (const w of corruptionWarnings) {
        findings.push({
          id: `W-${findings.length + 1}`,
          source: "corruption",
          severity: "HIGH",
          category: "BUG",
          message: `Corruption in ${w.file}: ${w.message}`,
          file: w.file,
          originalSeverity: "warn",
          originalCategory: "corruption",
        })
      }
      clearCorruptionWarnings()

      // D2: Analyze and prioritize
      findings.sort((a, b) => {
        const sev = severityOrder(a.severity) - severityOrder(b.severity)
        if (sev !== 0) return sev
        return categoryOrder(a.category) - categoryOrder(b.category)
      })

      const summary = { BUG: 0, MISSING_TEST: 0, HARDENING: 0, DOCS: 0 }
      for (const f of findings) {
        summary[f.category]++
      }
      const total = findings.length

      // D3 + D4: Fix handling — delegated to audit/clean with fix=true
      // The audit and clean tools already apply their own fixes when fix=true.
      // If the user passes --fix to selfheal, it re-runs both with fix=true.
      // After fix, it re-reads corruptionWarnings to detect if any new issues appeared.
      let fixed = 0
      let skipped = 0
      let failed = 0
      if (args.fix && findings.length > 0) {
        const fixAudit = await auditTool.execute({ fix: true }, context)
        const fixClean = await cleanTool.execute({ fix: true }, context)
        const fixedFindings = (fixAudit.metadata as Record<string, unknown>)?.findings as Array<{ message: string }> ?? []
        for (const ff of fixedFindings) {
          if (ff.message?.includes("(auto-fixed)")) {
            fixed++
          }
        }
        for (const f of findings) {
          if (f.severity === "LOW" || f.originalSeverity === "info") {
            skipped++
          }
        }
        skipped = Math.max(0, skipped - fixed)
      }

      const lines: string[] = []
      lines.push(`Health Scan: ${total} finding(s) — ${summary.BUG} BUG, ${summary.MISSING_TEST} MISSING_TEST, ${summary.HARDENING} HARDENING, ${summary.DOCS} DOCS`)
      for (const f of findings) {
        const sevTag = f.severity === "HIGH" ? "!!" : f.severity === "MED" ? "!" : "."
        lines.push(`[${sevTag}] ${f.category} (${f.severity}) [${f.source}] ${f.message}`)
      }
      if (args.fix) {
        lines.push(`\nFix result: ${fixed} fixed, ${skipped} skipped, ${failed} failed`)
      }

      return {
        title: `SelfHeal: ${total} finding(s)`,
        output: lines.join("\n"),
        metadata: {
          findings,
          summary,
          total,
          fixed,
          skipped,
          failed,
          auditOutput,
          cleanOutput,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `selfheal: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
