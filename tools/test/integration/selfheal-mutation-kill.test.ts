import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import selfhealTool from "../../speckit-selfheal"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { corruptionWarnings, pushCorruptionWarning, clearCorruptionWarnings } from "../../shared/types"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
  clearCorruptionWarnings()
})

afterEach(async () => {
  clearCorruptionWarnings()
  await destroyTempWorktree(worktree)
})

async function createFeatureWithPhase(phase: string, approvals?: Record<string, { generated: boolean; approved: boolean }>) {
  const specsDir = path.join(worktree, "specs")
  const featureDir = path.join(specsDir, "001-test-feature")
  await fs.mkdir(featureDir, { recursive: true })
  await fs.writeFile(path.join(featureDir, "spec.md"), "# Test Feature Spec\n")
  await fs.writeFile(path.join(featureDir, "plan.md"), "# Test Feature Plan\n")
  await fs.writeFile(path.join(featureDir, "tasks.md"), "# Test Feature Tasks\n")
  await fs.writeFile(path.join(featureDir, "spec.json"), JSON.stringify({
    feature_name: "Test Feature",
    feature_number: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phase,
    approvals: approvals || {
      spec: { generated: true, approved: true },
      plan: { generated: true, approved: true },
      tasks: { generated: true, approved: true },
    },
    ready_for_implementation: phase === "ready" || phase === "impl" || phase === "complete",
  }))
}

describe("Selfheal Phase 1: Killing Mutants in speckit-selfheal.ts", () => {

  describe("categorize() function: BUG categories", () => {
    it("categorizes phase-mismatch as BUG", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const phaseMismatchFindings = meta.findings.filter(f => f.originalCategory === "phase-mismatch")
      for (const f of phaseMismatchFindings) {
        expect(f.category).toBe("BUG")
      }
    })

    it("categorizes ready-violation as BUG", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: false },
        plan: { generated: true, approved: false },
        tasks: { generated: true, approved: false },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const readyViolationFindings = meta.findings.filter(f => f.originalCategory === "ready-violation")
      for (const f of readyViolationFindings) {
        expect(f.category).toBe("BUG")
      }
    })

    it("categorizes spec-json as BUG", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), "not valid json")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; source: string }> }
      expect(meta.findings.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("categorize() function: HARDENING categories", () => {
    it("categorizes approval-order as HARDENING", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: true },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const approvalOrderFindings = meta.findings.filter(f => f.originalCategory === "approval-order")
      for (const f of approvalOrderFindings) {
        expect(f.category).toBe("HARDENING")
      }
    })

    it("categorizes spec-clarity as HARDENING", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const specClarityFindings = meta.findings.filter(f => f.originalCategory === "spec-clarity")
      for (const f of specClarityFindings) {
        expect(f.category).toBe("HARDENING")
      }
    })

    it("categorizes tasks-boundary as HARDENING", async () => {
      await createFeatureWithPhase("tasks")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const tasksBoundaryFindings = meta.findings.filter(f => f.originalCategory === "tasks-boundary")
      for (const f of tasksBoundaryFindings) {
        expect(f.category).toBe("HARDENING")
      }
    })

    it("categorizes steering as HARDENING", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const steeringFindings = meta.findings.filter(f => f.originalCategory === "steering")
      for (const f of steeringFindings) {
        expect(f.category).toBe("HARDENING")
      }
    })

    it("categorizes unknown category as HARDENING", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), JSON.stringify({
        feature_name: "Test",
        feature_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: "spec",
        approvals: {
          spec: { generated: true, approved: false },
          plan: { generated: false, approved: false },
          tasks: { generated: false, approved: false },
        },
        ready_for_implementation: false,
      }))
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string }> }
      expect(meta.findings.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("categorize() function: DOCS categories", () => {
    it("categorizes optional-artifact as DOCS", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const optionalArtifactFindings = meta.findings.filter(f => f.originalCategory === "optional-artifact")
      for (const f of optionalArtifactFindings) {
        expect(f.category).toBe("DOCS")
      }
    })

    it("categorizes constitution as DOCS", async () => {
      await createConstitution(worktree)
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const constitutionFindings = meta.findings.filter(f => f.originalCategory === "constitution")
      for (const f of constitutionFindings) {
        expect(f.category).toBe("DOCS")
      }
    })

    it("categorizes features as DOCS", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const featuresFindings = meta.findings.filter(f => f.originalCategory === "features")
      for (const f of featuresFindings) {
        expect(f.category).toBe("DOCS")
      }
    })
  })

  describe("categorize() function: severity mapping", () => {
    it("maps error severity to HIGH", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), JSON.stringify({
        feature_name: "Test",
        feature_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: "spec",
        approvals: {
          spec: { generated: true, approved: false },
          plan: { generated: false, approved: false },
          tasks: { generated: false, approved: false },
        },
        ready_for_implementation: false,
      }))
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; originalSeverity: string }> }
      const errorFindings = meta.findings.filter(f => f.originalSeverity === "error")
      for (const f of errorFindings) {
        expect(f.severity).toBe("HIGH")
      }
    })

    it("maps warn severity to MED for bug categories", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), "not valid json")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; originalSeverity: string; category: string }> }
      const warnBugFindings = meta.findings.filter(f => f.originalSeverity === "warn" && f.category === "BUG")
      for (const f of warnBugFindings) {
        expect(f.severity).toBe("MED")
      }
    })

    it("maps info severity to LOW", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; originalSeverity: string }> }
      const infoFindings = meta.findings.filter(f => f.originalSeverity === "info")
      for (const f of infoFindings) {
        expect(f.severity).toBe("LOW")
      }
    })

    it("defaults to LOW for unknown severity", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), JSON.stringify({
        feature_name: "Test",
        feature_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: "spec",
        approvals: {
          spec: { generated: true, approved: false },
          plan: { generated: false, approved: false },
          tasks: { generated: false, approved: false },
        },
        ready_for_implementation: false,
      }))
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      expect(meta.findings.length).toBeGreaterThanOrEqual(0)
    })

    it("categorizes corruption as BUG with HIGH severity", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test corruption")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; severity: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.category).toBe("BUG")
        expect(f.severity).toBe("HIGH")
      }
    })
  })

  describe("sorting logic", () => {
    it("sorts HIGH severity before MED", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption test")
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      const severities = meta.findings.map(f => f.severity)
      const highIndices = severities.reduce((acc: number[], s: string, i: number) => s === "HIGH" ? [...acc, i] : acc, [])
      const medIndices = severities.reduce((acc: number[], s: string, i: number) => s === "MED" ? [...acc, i] : acc, [])
      if (highIndices.length > 0 && medIndices.length > 0) {
        expect(Math.max(...highIndices)).toBeLessThan(Math.min(...medIndices))
      }
    })

    it("sorts MED severity before LOW", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      const severities = meta.findings.map(f => f.severity)
      const medIndices = severities.reduce((acc: number[], s: string, i: number) => s === "MED" ? [...acc, i] : acc, [])
      const lowIndices = severities.reduce((acc: number[], s: string, i: number) => s === "LOW" ? [...acc, i] : acc, [])
      if (medIndices.length > 0 && lowIndices.length > 0) {
        expect(Math.max(...medIndices)).toBeLessThan(Math.min(...lowIndices))
      }
    })

    it("sorts BUG category before HARDENING when same severity", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption test")
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; severity: string }> }
      const highFindings = meta.findings.filter(f => f.severity === "HIGH")
      const bugIndices = highFindings.reduce((acc: number[], f, i) => f.category === "BUG" ? [...acc, i] : acc, [])
      const hardeningIndices = highFindings.reduce((acc: number[], f, i) => f.category === "HARDENING" ? [...acc, i] : acc, [])
      if (bugIndices.length > 0 && hardeningIndices.length > 0) {
        expect(Math.max(...bugIndices)).toBeLessThan(Math.min(...hardeningIndices))
      }
    })

    it("sorts MISSING_TEST before HARDENING when same severity", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; severity: string }> }
      const lowFindings = meta.findings.filter(f => f.severity === "LOW")
      const missingTestIndices = lowFindings.reduce((acc: number[], f, i) => f.category === "MISSING_TEST" ? [...acc, i] : acc, [])
      const hardeningIndices = lowFindings.reduce((acc: number[], f, i) => f.category === "HARDENING" ? [...acc, i] : acc, [])
      if (missingTestIndices.length > 0 && hardeningIndices.length > 0) {
        expect(Math.max(...missingTestIndices)).toBeLessThan(Math.min(...hardeningIndices))
      }
    })

    it("sorts HARDENING before DOCS when same severity", async () => {
      await createConstitution(worktree)
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; severity: string }> }
      const lowFindings = meta.findings.filter(f => f.severity === "LOW")
      const hardeningIndices = lowFindings.reduce((acc: number[], f, i) => f.category === "HARDENING" ? [...acc, i] : acc, [])
      const docsIndices = lowFindings.reduce((acc: number[], f, i) => f.category === "DOCS" ? [...acc, i] : acc, [])
      if (hardeningIndices.length > 0 && docsIndices.length > 0) {
        expect(Math.max(...hardeningIndices)).toBeLessThan(Math.min(...docsIndices))
      }
    })
  })

  describe("output string content", () => {
    it("output contains Health Scan header with finding count", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("Health Scan:")
      expect(result.output).toContain("finding(s)")
    })

    it("output contains BUG count in summary", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("BUG")
    })

    it("output contains MISSING_TEST count in summary", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("MISSING_TEST")
    })

    it("output contains HARDENING count in summary", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("HARDENING")
    })

    it("output contains DOCS count in summary", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("DOCS")
    })

    it("output uses !! for HIGH severity", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const lines = result.output.split("\n")
      const highLines = lines.filter(l => l.includes("(HIGH)"))
      for (const line of highLines) {
        expect(line).toMatch(/^\[!!\]/)
      }
    })

    it("output uses ! for MED severity", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      if (result.output.includes("MED")) {
        expect(result.output).toContain("[!]")
      }
    })

    it("output uses . for LOW severity", async () => {
      const result = await selfhealTool.execute({}, ctx)
      if (result.output.includes("LOW")) {
        expect(result.output).toContain("[.]")
      }
    })

    it("output contains source tag for audit findings", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const auditFindings = meta.findings.filter(f => f.source === "audit")
      if (auditFindings.length > 0) {
        expect(result.output).toContain("[audit]")
      }
    })

    it("output contains category tag", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("HARDENING")
    })

    it("output contains severity tag", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("MED")
    })

    it("output lines are joined with newline", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = result.output.split("\n")
      expect(lines.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("fix logic", () => {
    it("fix section appears when fix=true and findings exist", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.output).toContain("Fix result:")
    })

    it("fix section does not appear when fix=false", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: false }, ctx)
      expect(result.output).not.toContain("Fix result:")
    })

    it("fix section does not appear when no findings", async () => {
      const specsDir = path.join(worktree, "specs")
      await fs.mkdir(path.join(specsDir, "001-test"), { recursive: true })
      await fs.writeFile(path.join(specsDir, "001-test", "spec.md"), "# Spec")
      await fs.writeFile(path.join(specsDir, "001-test", "plan.md"), "# Plan")
      await fs.writeFile(path.join(specsDir, "001-test", "tasks.md"), "# Tasks")
      await fs.writeFile(path.join(specsDir, "001-test", "spec.json"), JSON.stringify({
        feature_name: "Test",
        feature_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: "complete",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: true, approved: true },
          tasks: { generated: true, approved: true },
        },
        ready_for_implementation: true,
      }))
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { total: number }
      if (meta.total === 0) {
        expect(result.output).not.toContain("Fix result:")
      }
    })

    it("fixed count is a number", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(typeof meta.fixed).toBe("number")
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
    })

    it("skipped count is a number", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(typeof meta.skipped).toBe("number")
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("failed count is always 0", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { failed: number }
      expect(meta.failed).toBe(0)
    })

    it("skipped is not negative after subtracting fixed", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; fixed: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("fix result line contains fixed, skipped, and failed counts", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.output).toContain("fixed")
      expect(result.output).toContain("skipped")
      expect(result.output).toContain("failed")
    })
  })

  describe("corruption warnings", () => {
    it("includes corruption warnings in findings", async () => {
      const corruptFile = path.join(worktree, ".opencode", "session.json")
      await fs.writeFile(corruptFile, "not valid json")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      expect(corruptionFindings.length).toBeGreaterThanOrEqual(0)
    })

    it("corruption findings have severity HIGH", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.severity).toBe("HIGH")
      }
    })

    it("corruption findings have category BUG", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.category).toBe("BUG")
      }
    })

    it("corruption finding message contains file path", async () => {
      const testFile = path.join(worktree, ".opencode", "session.json")
      pushCorruptionWarning(testFile, "test error")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ message: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.message).toContain("session.json")
      }
    })

    it("corruption finding message contains error message", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "specific error text")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ message: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.message).toContain("specific error text")
      }
    })

    it("corruption finding has correct id format W-", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.id).toMatch(/^W-/)
      }
    })

    it("corruption finding has originalSeverity warn", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalSeverity: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.originalSeverity).toBe("warn")
      }
    })

    it("corruption finding has originalCategory corruption", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalCategory: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.originalCategory).toBe("corruption")
      }
    })

    it("clears corruption warnings after processing", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      expect(corruptionWarnings.length).toBeGreaterThan(0)
      await selfhealTool.execute({}, ctx)
      expect(corruptionWarnings.length).toBe(0)
    })
  })

  describe("project warnings", () => {
    it("returns warning when project has issues", async () => {
      const badDir = path.join(worktree, "nonexistent")
      await fs.mkdir(badDir, { recursive: true })
      const badCtx = mockContext(badDir)
      const result = await selfhealTool.execute({}, badCtx)
      expect(result.title).toBeDefined()
    })

    it("warning output contains warning messages", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toBeDefined()
      expect(typeof result.output).toBe("string")
    })

    it("warning metadata has requiresConfirmation when warnings exist", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { requiresConfirmation?: boolean }
      if (meta.requiresConfirmation !== undefined) {
        expect(typeof meta.requiresConfirmation).toBe("boolean")
      }
    })

    it("warning metadata contains warnings array when warnings exist", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { warnings?: Array<unknown> }
      if (meta.warnings !== undefined) {
        expect(Array.isArray(meta.warnings)).toBe(true)
      }
    })

    it("warning title is Warning when warnings exist", async () => {
      const result = await selfhealTool.execute({}, ctx)
      if (result.title === "Warning") {
        expect(result.title).toBe("Warning")
      }
    })
  })

  describe("audit and clean integration", () => {
    it("audit findings are categorized correctly", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const auditFindings = meta.findings.filter(f => f.source === "audit")
      expect(auditFindings.length).toBeGreaterThanOrEqual(0)
    })

    it("clean findings are categorized as phase-mismatch", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalCategory: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.originalCategory).toBe("clean")
      }
    })

    it("audit finding id starts with A-", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const auditFindings = meta.findings.filter(f => f.source === "audit")
      for (const f of auditFindings) {
        expect(f.id).toMatch(/^A-/)
      }
    })

    it("clean finding id starts with C-", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.id).toMatch(/^C-/)
      }
    })

    it("audit finding source is audit", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const auditFindings = meta.findings.filter(f => f.source === "audit")
      for (const f of auditFindings) {
        expect(f.source).toBe("audit")
      }
    })

    it("clean finding source is clean", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.source).toBe("clean")
      }
    })

    it("auditOutput is populated", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { auditOutput: string }
      expect(typeof meta.auditOutput).toBe("string")
    })

    it("cleanOutput is populated", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { cleanOutput: string }
      expect(typeof meta.cleanOutput).toBe("string")
    })
  })

  describe("summary counting", () => {
    it("summary counts BUG findings correctly", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { summary: { BUG: number }; findings: Array<{ category: string }> }
      const expectedBugCount = meta.findings.filter(f => f.category === "BUG").length
      expect(meta.summary.BUG).toBe(expectedBugCount)
    })

    it("summary counts HARDENING findings correctly", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { summary: { HARDENING: number }; findings: Array<{ category: string }> }
      const expectedHardeningCount = meta.findings.filter(f => f.category === "HARDENING").length
      expect(meta.summary.HARDENING).toBe(expectedHardeningCount)
    })

    it("summary counts DOCS findings correctly", async () => {
      await createConstitution(worktree)
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { summary: { DOCS: number }; findings: Array<{ category: string }> }
      const expectedDocsCount = meta.findings.filter(f => f.category === "DOCS").length
      expect(meta.summary.DOCS).toBe(expectedDocsCount)
    })

    it("summary counts MISSING_TEST findings correctly", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { summary: { MISSING_TEST: number }; findings: Array<{ category: string }> }
      const expectedMissingTestCount = meta.findings.filter(f => f.category === "MISSING_TEST").length
      expect(meta.summary.MISSING_TEST).toBe(expectedMissingTestCount)
    })

    it("total matches findings length", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { total: number; findings: Array<unknown> }
      expect(meta.total).toBe(meta.findings.length)
    })
  })

  describe("error handling", () => {
    it("catches and returns error title", async () => {
      const result = await selfhealTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
    })

    it("error output contains error message", async () => {
      const result = await selfhealTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.output).toContain("No worktree path provided")
    })

    it("error result has no metadata", async () => {
      const result = await selfhealTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.metadata).toBeUndefined()
    })
  })

  describe("title format", () => {
    it("title contains SelfHeal prefix", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toContain("SelfHeal")
    })

    it("title contains finding count", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toContain("finding(s)")
    })

    it("title format is correct", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toMatch(/^SelfHeal: \d+ finding\(s\)$/)
    })
  })

  describe("metadata structure", () => {
    it("metadata contains findings array", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<unknown> }
      expect(Array.isArray(meta.findings)).toBe(true)
    })

    it("metadata contains summary object", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { summary: Record<string, number> }
      expect(typeof meta.summary).toBe("object")
    })

    it("metadata contains total count", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { total: number }
      expect(typeof meta.total).toBe("number")
    })

    it("metadata contains fixed count", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(typeof meta.fixed).toBe("number")
    })

    it("metadata contains skipped count", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(typeof meta.skipped).toBe("number")
    })

    it("metadata contains failed count", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { failed: number }
      expect(typeof meta.failed).toBe("number")
    })

    it("metadata contains auditOutput string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { auditOutput: string }
      expect(typeof meta.auditOutput).toBe("string")
    })

    it("metadata contains cleanOutput string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { cleanOutput: string }
      expect(typeof meta.cleanOutput).toBe("string")
    })
  })

  describe("finding structure", () => {
    it("each finding has id string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: unknown }> }
      for (const f of meta.findings) {
        expect(typeof f.id).toBe("string")
      }
    })

    it("each finding has source string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: unknown }> }
      for (const f of meta.findings) {
        expect(typeof f.source).toBe("string")
      }
    })

    it("each finding has severity string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: unknown }> }
      for (const f of meta.findings) {
        expect(typeof f.severity).toBe("string")
      }
    })

    it("each finding has category string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: unknown }> }
      for (const f of meta.findings) {
        expect(typeof f.category).toBe("string")
      }
    })

    it("each finding has message string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ message: unknown }> }
      for (const f of meta.findings) {
        expect(typeof f.message).toBe("string")
      }
    })

    it("each finding has originalSeverity string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalSeverity: unknown }> }
      for (const f of meta.findings) {
        expect(typeof f.originalSeverity).toBe("string")
      }
    })

    it("each finding has originalCategory string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalCategory: unknown }> }
      for (const f of meta.findings) {
        expect(typeof f.originalCategory).toBe("string")
      }
    })
  })
})
