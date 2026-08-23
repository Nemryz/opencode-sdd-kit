import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import auditTool, { AuditFinding } from "../../speckit-audit"
import scaffoldTool from "../../speckit-scaffold"
import deltaTool from "../../speckit-delta"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { readSpecJson, writeSpecJson, specsDirPath, specJsonPath, steeringDirPath, PATHS } from "../../shared/types"
import { corruptionWarnings, pushCorruptionWarning, clearCorruptionWarnings, writeWithBackup, writeFileChecksum } from "../../shared/io"
import { SessionStateSchema } from "../../shared/schemas"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
  await createConstitution(worktree)
  clearCorruptionWarnings()
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

async function getFeatureDir(): Promise<string> {
  const dirs = await fs.readdir(specsDirPath(worktree))
  return path.join(specsDirPath(worktree), dirs[0])
}

function makeValidSpec(overrides?: Record<string, any>) {
  return {
    feature_name: "Test Feature",
    feature_number: 1,
    title: "Test Feature",
    status: "approved",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phase: "spec",
    approvals: {
      spec: { generated: true, approved: false },
      plan: { generated: false, approved: false },
      tasks: { generated: false, approved: false },
    },
    spec_generated: true,
    plan_generated: false,
    tasks_generated: false,
    ready_for_implementation: false,
    active_delta: null,
    ...overrides,
  }
}

describe("Phase 3: Audit Module - Mutation Score Improvement", () => {

  describe("3.1 Corruption scanning", () => {
    it("reports pre-existing corruption warnings in findings", async () => {
      pushCorruptionWarning("/test/file.json", "test corruption message")
      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      const corruptionFindings = findings.filter((f: AuditFinding) => f.category === "corruption")
      expect(corruptionFindings).toHaveLength(1)
      expect(corruptionFindings[0].message).toContain("test corruption message")
    })

    it("reports multiple pre-existing corruption warnings", async () => {
      pushCorruptionWarning("/test/file1.json", "corruption 1")
      pushCorruptionWarning("/test/file2.json", "corruption 2")
      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      const corruptionFindings = findings.filter((f: AuditFinding) => f.category === "corruption")
      expect(corruptionFindings).toHaveLength(2)
    })

    it("clears corruption warnings after audit", async () => {
      pushCorruptionWarning("/test/file.json", "test message")
      await auditTool.execute({}, ctx)
      expect(corruptionWarnings).toHaveLength(0)
    })

    it("reports corruption with warn severity", async () => {
      pushCorruptionWarning("/test/file.json", "test corruption")
      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      const corruptionFindings = findings.filter((f: AuditFinding) => f.category === "corruption")
      expect(corruptionFindings[0].severity).toBe("warn")
    })

    it("handles corrupted spec.json with spec-json finding", async () => {
      await scaffoldTool.execute({ featureName: "Feature One", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Feature Two", template: "spec" }, ctx)
      const dirs = await fs.readdir(specsDirPath(worktree))

      for (const dir of dirs) {
        const base = path.join(specsDirPath(worktree), dir)
        const sjFp = specJsonPath(base)
        await fs.writeFile(sjFp, "CORRUPT", "utf-8")
        await fs.rm(path.join(base, "spec.md"))
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      const specJsonFindings = findings.filter((f: AuditFinding) => f.category === "spec-json")
      expect(specJsonFindings.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe("3.2 Delta findings", () => {
    it("reports no delta findings when deltas are fresh and few", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const deltasDir = path.join(featureDir, "deltas")
      await fs.mkdir(deltasDir, { recursive: true })
      await fs.writeFile(path.join(deltasDir, "deltas.json"), JSON.stringify({
        feature: "001-test-feature",
        deltas: [{
          id: "D001",
          type: "feature",
          title: "Test Delta",
          status: "draft",
          impact: "medium",
          parent_feature: "001-test-feature",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      }, null, 2))

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "delta-sprawl")).toBe(false)
      expect(findings.some((f: AuditFinding) => f.category === "stale-delta")).toBe(false)
    })

    it("reports stale deltas older than 7 days", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const deltasDir = path.join(featureDir, "deltas")
      await fs.mkdir(deltasDir, { recursive: true })
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      await fs.writeFile(path.join(deltasDir, "deltas.json"), JSON.stringify({
        feature: "001-test-feature",
        deltas: [{
          id: "D001",
          type: "feature",
          title: "Old Delta",
          status: "draft",
          impact: "medium",
          parent_feature: "001-test-feature",
          created_at: oldDate,
          updated_at: oldDate,
        }],
      }, null, 2))

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "stale-delta")).toBe(true)
    })

    it("does not report consolidated deltas as stale", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const deltasDir = path.join(featureDir, "deltas")
      await fs.mkdir(deltasDir, { recursive: true })
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      await fs.writeFile(path.join(deltasDir, "deltas.json"), JSON.stringify({
        feature: "001-test-feature",
        deltas: [{
          id: "D001",
          type: "feature",
          title: "Consolidated Delta",
          status: "consolidated",
          impact: "medium",
          parent_feature: "001-test-feature",
          created_at: oldDate,
          updated_at: oldDate,
          consolidated_at: oldDate,
        }],
      }, null, 2))

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "stale-delta")).toBe(false)
    })

    it("reports delta sprawl when more than 5 active deltas", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const deltasDir = path.join(featureDir, "deltas")
      await fs.mkdir(deltasDir, { recursive: true })
      const deltas = Array.from({ length: 6 }, (_, i) => ({
        id: `D00${i + 1}`,
        type: "feature" as const,
        title: `Delta ${i + 1}`,
        status: "draft" as const,
        impact: "medium" as const,
        parent_feature: "001-test-feature",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      await fs.writeFile(path.join(deltasDir, "deltas.json"), JSON.stringify({
        feature: "001-test-feature",
        deltas,
      }, null, 2))

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "delta-sprawl")).toBe(true)
    })
  })

  describe("3.3 Backup integrity", () => {
    it("reports frontmatter recovery when spec.json missing but frontmatter exists", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sjPath = specJsonPath(featureDir)
      await fs.rm(sjPath)

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "frontmatter-recovery")).toBe(true)
    })

    it("reports spec-json warn when both spec.json and frontmatter missing", async () => {
      await fs.mkdir(path.join(worktree, "specs", "001-auth"), { recursive: true })
      await fs.writeFile(path.join(worktree, "specs", "001-auth", "spec.md"), "# Auth")

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "spec-json" && f.severity === "warn")).toBe(true)
    })
  })

  describe("3.4 Phase mismatch edge cases", () => {
    it("reports error when phase is ready but only spec exists", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "ready"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      const phaseMismatch = findings.filter((f: AuditFinding) => f.category === "phase-mismatch")
      expect(phaseMismatch.some((f: AuditFinding) => f.message.includes("ready"))).toBe(true)
    })

    it("reports error when phase is tasks but tasks.md missing", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "tasks"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "phase-mismatch" && f.message.includes("tasks"))).toBe(true)
    })

    it("reports error when phase is plan but plan.md missing", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "plan"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "phase-mismatch" && f.message.includes("plan"))).toBe(true)
    })

    it("reports error when phase is spec but spec.md missing", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      await fs.rm(path.join(featureDir, "spec.md"))
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "spec"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "phase-mismatch" && f.message.includes("spec"))).toBe(true)
    })
  })

  describe("3.5 Approval order checks", () => {
    it("reports warn when spec approved but plan not generated", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.approvals.spec.approved = true
        sj.approvals.plan.generated = false
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "approval-order" && f.severity === "warn")).toBe(true)
    })

    it("does not report approval-order when plan is generated", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.approvals.spec.approved = true
        sj.approvals.plan.generated = true
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "approval-order")).toBe(false)
    })
  })

  describe("3.6 Ready violation checks", () => {
    it("reports error when ready_for_implementation but artifacts incomplete", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.ready_for_implementation = true
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "ready-violation" && f.severity === "error")).toBe(true)
    })

    it("does not report ready-violation when all artifacts exist", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.ready_for_implementation = true
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "ready-violation")).toBe(false)
    })
  })

  describe("3.7 Spec clarity checks", () => {
    it("reports warn when spec contains NEEDS CLARIFICATION", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const specPath = path.join(featureDir, "spec.md")
      await fs.appendFile(specPath, "\n[NEEDS CLARIFICATION] auth flow\n")

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "spec-clarity" && f.severity === "warn")).toBe(true)
    })

    it("does not report spec-clarity when no markers", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "spec-clarity")).toBe(false)
    })
  })

  describe("3.8 Tasks boundary checks", () => {
    it("reports info when tasks has no Boundary annotations", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      const featureDir = await getFeatureDir()
      const tasksPath = path.join(featureDir, "tasks.md")
      await fs.writeFile(tasksPath, "# Tasks\n- Task one\n- Task two")

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "tasks-boundary")).toBe(true)
    })

    it("does not report tasks-boundary when annotations exist", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      const featureDir = await getFeatureDir()
      const tasksPath = path.join(featureDir, "tasks.md")
      await fs.writeFile(tasksPath, "# Tasks\n- Task one Boundary: Auth\n- Task two Boundary: Auth")

      const result = await auditTool.execute({}, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "tasks-boundary")).toBe(false)
    })
  })

  describe("3.9 Auto-fix behavior", () => {
    it("fixes phase mismatch and updates spec.json", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "ready"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({ fix: true }, ctx)
      const findings = result.metadata?.findings ?? []
      const fixed = findings.filter((f: AuditFinding) => f.message.includes("auto-fixed"))
      expect(fixed.length).toBeGreaterThanOrEqual(1)
      const fixedSj = await readSpecJson(featureDir)
      expect(fixedSj?.phase).not.toBe("ready")
    })

    it("fixes ready-violation by setting ready_for_implementation to false", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.ready_for_implementation = true
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({ fix: true }, ctx)
      const fixedSj = await readSpecJson(featureDir)
      expect(fixedSj?.ready_for_implementation).toBe(false)
    })

    it("fixes approval by marking spec.generated as true", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.approvals.spec.generated = false
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({ fix: true }, ctx)
      const fixedSj = await readSpecJson(featureDir)
      expect(fixedSj?.approvals.spec.generated).toBe(true)
    })

    it("does not fix unfixable findings", async () => {
      await fs.mkdir(path.join(worktree, "specs", "001-auth"), { recursive: true })
      await fs.writeFile(path.join(worktree, "specs", "001-auth", "spec.md"), "# Auth")

      const result = await auditTool.execute({ fix: true }, ctx)
      const findings = result.metadata?.findings ?? []
      expect(findings.some((f: AuditFinding) => f.category === "spec-json" && f.severity === "warn")).toBe(true)
    })
  })

  describe("3.10 Summary calculation", () => {
    it("counts errors correctly", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "ready"
        sj.ready_for_implementation = true
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      expect(result.metadata?.errorCount).toBeGreaterThanOrEqual(2)
    })

    it("counts warnings correctly", async () => {
      pushCorruptionWarning("/test/file.json", "test warning")
      const result = await auditTool.execute({}, ctx)
      expect(result.metadata?.warnCount).toBeGreaterThanOrEqual(1)
    })

    it("counts info correctly", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const result = await auditTool.execute({}, ctx)
      expect(result.metadata?.infoCount).toBeGreaterThanOrEqual(1)
    })

    it("passes when no errors", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
      const result = await auditTool.execute({}, ctx)
      expect(result.metadata?.passed).toBe(true)
    })

    it("fails when errors exist", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "ready"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      expect(result.metadata?.passed).toBe(false)
    })
  })

  describe("3.11 Output formatting", () => {
    it("shows PASS when no errors", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
      const result = await auditTool.execute({}, ctx)
      expect(result.output).toContain("PASS")
    })

    it("shows FAIL when errors exist", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "ready"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      expect(result.output).toContain("FAIL")
    })

    it("shows error count in title", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "ready"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      expect(result.title).toContain("issue")
    })

    it("shows findings with correct tags", async () => {
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const featureDir = await getFeatureDir()
      const sj = await readSpecJson(featureDir)
      if (sj) {
        sj.phase = "ready"
        await writeSpecJson(sj, featureDir)
      }

      const result = await auditTool.execute({}, ctx)
      expect(result.output).toContain("[ERR]")
    })
  })

  describe("3.12 Error handling", () => {
    it("returns error when no worktree", async () => {
      const result = await auditTool.execute({}, { worktree: undefined } as any)
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error when invalid project root", async () => {
      const result = await auditTool.execute({}, { worktree: "/nonexistent" } as any)
      expect(result.title).toBe("Error")
    })
  })
})
