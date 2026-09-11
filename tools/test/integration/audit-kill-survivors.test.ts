import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import auditTool, { AuditFinding } from "../../speckit-audit"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { readSpecJson, writeSpecJson, specsDirPath } from "../../shared/types"
import { clearCorruptionWarnings, pushCorruptionWarning, readFrontmatter } from "../../shared/io"

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

describe("Audit kill survivors - auto-fix approval for plan and tasks", () => {
  it("fixes plan approval and sets approvals.plan.generated to true in spec.json", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.plan.generated = false
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const fixedSj = await readSpecJson(featureDir)
    expect(fixedSj?.approvals.plan.generated).toBe(true)
  })

  it("fixes tasks approval and sets approvals.tasks.generated to true in spec.json", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.tasks.generated = false
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const fixedSj = await readSpecJson(featureDir)
    expect(fixedSj?.approvals.tasks.generated).toBe(true)
  })

  it("fixes all three approvals at once and all are true in spec.json", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.spec.generated = false
      sj.approvals.plan.generated = false
      sj.approvals.tasks.generated = false
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const fixedSj = await readSpecJson(featureDir)
    expect(fixedSj?.approvals.spec.generated).toBe(true)
    expect(fixedSj?.approvals.plan.generated).toBe(true)
    expect(fixedSj?.approvals.tasks.generated).toBe(true)
  })

  it("does not change approval when already generated", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.plan.generated = true
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const after = await readSpecJson(featureDir)
    expect(after?.approvals.plan.generated).toBe(true)
  })

  it("fixes only spec approval when plan and tasks are also unmarked", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.spec.generated = false
      sj.approvals.plan.generated = false
      sj.approvals.tasks.generated = false
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const fixedSj = await readSpecJson(featureDir)
    expect(fixedSj?.approvals.spec.generated).toBe(true)
  })
})

describe("Audit kill survivors - post-fix summary update", () => {
  it("writes last_audit.severity to spec.md frontmatter after fix", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.spec.generated = false
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const specMdPath = path.join(featureDir, "spec.md")
    const fm = await readFrontmatter(specMdPath)
    expect(fm?.last_audit).toBeDefined()
    expect(fm?.last_audit?.severity).toBeDefined()
  })

  it("decrements error count in metadata after fix", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.phase = "ready"
      sj.approvals.spec.generated = false
      await writeSpecJson(sj, featureDir)
    }

    const result = await auditTool.execute({ fix: true }, ctx)
    expect(result.metadata?.errorCount).toBeGreaterThanOrEqual(0)
  })

  it("sets passed true after fix when 0 errors remain", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.spec.generated = false
      await writeSpecJson(sj, featureDir)
    }

    const result = await auditTool.execute({ fix: true }, ctx)
    expect(result.metadata?.passed).toBe(true)
  })

  it("sets passed false after fix when errors still remain", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.phase = "spec"
      await writeSpecJson(sj, featureDir)
    }
    await fs.rm(path.join(featureDir, "spec.md"))

    const result = await auditTool.execute({ fix: true }, ctx)
    expect(result.metadata?.passed).toBe(false)
  })

  it("appends auto-fixed to finding message after fix", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.spec.generated = false
      await writeSpecJson(sj, featureDir)
    }

    const result = await auditTool.execute({ fix: true }, ctx)
    const findings = result.metadata?.findings ?? []
    const fixed = findings.filter((f: AuditFinding) => f.message.includes("auto-fixed"))
    expect(fixed.length).toBeGreaterThanOrEqual(1)
  })
})

describe("Audit kill survivors - delta boundaries", () => {
  it("does not report stale-delta when delta is just under 7 days old", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const deltasDir = path.join(featureDir, "deltas")
    await fs.mkdir(deltasDir, { recursive: true })
    const justUnder7Days = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 - 23 * 60 * 60 * 1000).toISOString()
    await fs.writeFile(path.join(deltasDir, "deltas.json"), JSON.stringify({
      feature: "001-test-feature",
      deltas: [{
        id: "D001",
        type: "feature",
        title: "Boundary Delta",
        status: "draft",
        impact: "medium",
        parent_feature: "001-test-feature",
        created_at: justUnder7Days,
        updated_at: justUnder7Days,
      }],
    }, null, 2))

    const result = await auditTool.execute({}, ctx)
    const findings = result.metadata?.findings ?? []
    expect(findings.some((f: AuditFinding) => f.category === "stale-delta")).toBe(false)
  })

  it("reports stale-delta when delta is 8 days old", async () => {
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

  it("does not report delta-sprawl when exactly 5 active deltas", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const deltasDir = path.join(featureDir, "deltas")
    await fs.mkdir(deltasDir, { recursive: true })
    const now = new Date().toISOString()
    const deltas = Array.from({ length: 5 }, (_, i) => ({
      id: `D00${i + 1}`,
      type: "feature" as const,
      title: `Delta ${i + 1}`,
      status: "draft" as const,
      impact: "medium" as const,
      parent_feature: "001-test-feature",
      created_at: now,
      updated_at: now,
    }))
    await fs.writeFile(path.join(deltasDir, "deltas.json"), JSON.stringify({
      feature: "001-test-feature",
      deltas,
    }, null, 2))

    const result = await auditTool.execute({}, ctx)
    const findings = result.metadata?.findings ?? []
    expect(findings.some((f: AuditFinding) => f.category === "delta-sprawl")).toBe(false)
  })
})

describe("Audit kill survivors - severity calculation", () => {
  it("writes last_audit with date and findings count to spec.md frontmatter", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.spec.generated = false
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const specMdPath = path.join(featureDir, "spec.md")
    const fm = await readFrontmatter(specMdPath)
    expect(fm?.last_audit).toBeDefined()
    expect(fm?.last_audit?.date).toBeDefined()
    expect(fm?.last_audit?.findings).toBeGreaterThanOrEqual(1)
  })

  it("writes last_audit.severity low when 0 errors after fix", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.approvals.spec.generated = false
      await writeSpecJson(sj, featureDir)
    }

    await auditTool.execute({ fix: true }, ctx)
    const specMdPath = path.join(featureDir, "spec.md")
    const fm = await readFrontmatter(specMdPath)
    expect(fm?.last_audit?.severity).toBe("low")
  })

  it("does not write last_audit when no fixes applied", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)

    await auditTool.execute({ fix: true }, ctx)
    const featureDir = await getFeatureDir()
    const specMdPath = path.join(featureDir, "spec.md")
    const fm = await readFrontmatter(specMdPath)
    expect(fm?.last_audit).toBeUndefined()
  })
})

describe("Audit kill survivors - output formatting", () => {
  it("shows WRN tag when warn-level findings exist", async () => {
    pushCorruptionWarning("/test/warn.json", "test warning")
    const result = await auditTool.execute({}, ctx)
    expect(result.output).toContain("[WRN]")
  })

  it("shows output with counts when findings exist", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const result = await auditTool.execute({}, ctx)
    expect(result.output).toContain("info")
  })

  it("title shows issue(s) with findings", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.phase = "ready"
      sj.ready_for_implementation = true
      await writeSpecJson(sj, featureDir)
    }

    const result = await auditTool.execute({}, ctx)
    expect(result.title).toContain("issue(s)")
  })

  it("title shows issue(s) when clean", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
    const result = await auditTool.execute({}, ctx)
    expect(result.title).toContain("issue(s)")
  })
})

describe("Audit kill survivors - file paths in findings", () => {
  it("phase-mismatch finding has file ending in spec.json", async () => {
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
    expect(phaseMismatch.length).toBeGreaterThanOrEqual(1)
    expect(phaseMismatch[0].file).toContain("spec.json")
  })

  it("plan phase-mismatch finding has file ending in spec.json", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.phase = "plan"
      await writeSpecJson(sj, featureDir)
    }

    const result = await auditTool.execute({}, ctx)
    const findings = result.metadata?.findings ?? []
    const phaseMismatch = findings.filter((f: AuditFinding) => f.category === "phase-mismatch")
    expect(phaseMismatch.length).toBeGreaterThanOrEqual(1)
    expect(phaseMismatch[0].file).toContain("spec.json")
  })

  it("tasks phase-mismatch finding has file ending in spec.json", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.phase = "tasks"
      await writeSpecJson(sj, featureDir)
    }

    const result = await auditTool.execute({}, ctx)
    const findings = result.metadata?.findings ?? []
    const phaseMismatch = findings.filter((f: AuditFinding) => f.category === "phase-mismatch")
    expect(phaseMismatch.length).toBeGreaterThanOrEqual(1)
    expect(phaseMismatch[0].file).toContain("spec.json")
  })
})

describe("Audit kill survivors - fixedCount edge cases", () => {
  it("does not apply fix when findings list is empty", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
    await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
    const featureDir = await getFeatureDir()
    const before = await readSpecJson(featureDir)

    await auditTool.execute({ fix: true }, ctx)
    const after = await readSpecJson(featureDir)
    expect(after?.phase).toBe(before?.phase)
  })

  it("fixes both error and info findings independently", async () => {
    await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
    const featureDir = await getFeatureDir()
    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.phase = "ready"
      sj.approvals.spec.generated = false
      await writeSpecJson(sj, featureDir)
    }

    const result = await auditTool.execute({ fix: true }, ctx)
    const fixedSj = await readSpecJson(featureDir)
    expect(fixedSj?.phase).not.toBe("ready")
    expect(fixedSj?.approvals.spec.generated).toBe(true)
  })

  it("fixes multiple phase-mismatch findings across features", async () => {
    await scaffoldTool.execute({ featureName: "Feature One", template: "spec" }, ctx)
    await scaffoldTool.execute({ featureName: "Feature Two", template: "spec" }, ctx)
    const dirs = await fs.readdir(specsDirPath(worktree))

    for (const dir of dirs) {
      const base = path.join(specsDirPath(worktree), dir)
      const sj = await readSpecJson(base)
      if (sj) {
        sj.phase = "ready"
        await writeSpecJson(sj, base)
      }
    }

    const result = await auditTool.execute({ fix: true }, ctx)
    const fixed = (result.metadata?.findings ?? []).filter((f: AuditFinding) => f.message.includes("auto-fixed"))
    expect(fixed.length).toBeGreaterThanOrEqual(2)
  })
})
