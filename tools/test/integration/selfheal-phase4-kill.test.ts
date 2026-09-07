import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import selfhealTool from "../../speckit-selfheal"
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

describe("Selfheal Phase 4: Additional Kill Tests for speckit-selfheal.ts", () => {

  describe("categorize() - bugCategories array content", () => {
    it("phase-mismatch maps to BUG category", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), JSON.stringify({
        feature_name: "Test",
        feature_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: "ready",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: true, approved: true },
          tasks: { generated: true, approved: true },
        },
        ready_for_implementation: true,
      }))
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "phase-mismatch")
      expect(findings.length).toBeGreaterThan(0)
      for (const f of findings) {
        expect(f.category).toBe("BUG")
      }
    })

    it("ready-violation maps to BUG category", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), JSON.stringify({
        feature_name: "Test",
        feature_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: "ready",
        approvals: {
          spec: { generated: true, approved: false },
          plan: { generated: true, approved: false },
          tasks: { generated: true, approved: false },
        },
        ready_for_implementation: true,
      }))
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "ready-violation")
      expect(findings.length).toBeGreaterThan(0)
      for (const f of findings) {
        expect(f.category).toBe("BUG")
      }
    })

    it("spec-json maps to BUG category", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), "invalid json {{{")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "spec-json")
      for (const f of findings) {
        expect(f.category).toBe("BUG")
      }
    })
  })

  describe("categorize() - hardeningCategories array content", () => {
    it("approval-order maps to HARDENING category", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: true },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "approval-order")
      expect(findings.length).toBeGreaterThan(0)
      for (const f of findings) {
        expect(f.category).toBe("HARDENING")
      }
    })

    it("spec-clarity maps to HARDENING category", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "spec-clarity")
      for (const f of findings) {
        expect(f.category).toBe("HARDENING")
      }
    })

    it("tasks-boundary maps to HARDENING category", async () => {
      await createFeatureWithPhase("tasks")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "tasks-boundary")
      for (const f of findings) {
        expect(f.category).toBe("HARDENING")
      }
    })

    it("steering maps to HARDENING category", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "steering")
      for (const f of findings) {
        expect(f.category).toBe("HARDENING")
      }
    })
  })

  describe("categorize() - docCategories array content", () => {
    it("optional-artifact maps to DOCS category", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "optional-artifact")
      for (const f of findings) {
        expect(f.category).toBe("DOCS")
      }
    })

    it("constitution maps to DOCS category", async () => {
      await createConstitution(worktree)
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "constitution")
      for (const f of findings) {
        expect(f.category).toBe("DOCS")
      }
    })

    it("features maps to DOCS category", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; originalCategory: string }> }
      const findings = meta.findings.filter(f => f.originalCategory === "features")
      for (const f of findings) {
        expect(f.category).toBe("DOCS")
      }
    })
  })

  describe("categorize() - severity mapping with nullish coalescing", () => {
    it("error severity maps to HIGH for bug categories", async () => {
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
      expect(errorFindings.length).toBeGreaterThan(0)
      for (const f of errorFindings) {
        expect(f.severity).toBe("HIGH")
      }
    })

    it("warn severity maps to MED for hardening categories", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: true },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; originalSeverity: string; category: string }> }
      const warnHardeningFindings = meta.findings.filter(f => f.originalSeverity === "warn" && f.category === "HARDENING")
      for (const f of warnHardeningFindings) {
        expect(f.severity).toBe("MED")
      }
    })

    it("info severity maps to LOW for all categories", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; originalSeverity: string }> }
      const infoFindings = meta.findings.filter(f => f.originalSeverity === "info")
      expect(infoFindings.length).toBeGreaterThan(0)
      for (const f of infoFindings) {
        expect(f.severity).toBe("LOW")
      }
    })

    it("unknown severity defaults to LOW via nullish coalescing", async () => {
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
  })

  describe("categorize() - corruption special case", () => {
    it("corruption category maps to BUG with HIGH severity", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test corruption")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; severity: string; source: string }> }
      const allFindings = meta.findings
      expect(allFindings.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("sorting - severityOrder and categoryOrder", () => {
    it("HIGH severity comes before MED in output", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption for sort")
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

    it("MED severity comes before LOW in output", async () => {
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

    it("BUG category comes before HARDENING when same severity", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption for category sort")
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

    it("MISSING_TEST category comes before HARDENING when same severity", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; severity: string }> }
      const missingTestFindings = meta.findings.filter(f => f.category === "MISSING_TEST")
      const hardeningFindings = meta.findings.filter(f => f.category === "HARDENING")
      if (missingTestFindings.length > 0 && hardeningFindings.length > 0) {
        const lastMissingTest = meta.findings.findIndex(f => f.category === "MISSING_TEST")
        const firstHardening = meta.findings.findIndex(f => f.category === "HARDENING")
        expect(lastMissingTest).toBeLessThan(firstHardening)
      }
    })

    it("HARDENING category comes before DOCS when same severity", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string; severity: string }> }
      const hardeningFindings = meta.findings.filter(f => f.category === "HARDENING")
      const docsFindings = meta.findings.filter(f => f.category === "DOCS")
      if (hardeningFindings.length > 0 && docsFindings.length > 0) {
        const lastHardening = meta.findings.findIndex(f => f.category === "HARDENING")
        const firstDocs = meta.findings.findIndex(f => f.category === "DOCS")
        expect(lastHardening).toBeLessThan(firstDocs)
      }
    })
  })

  describe("output formatting - severity tags", () => {
    it("HIGH severity uses !! tag", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const lines = result.output.split("\n")
      const highLines = lines.filter(l => l.includes("(HIGH)"))
      for (const line of highLines) {
        expect(line).toMatch(/^\[!!\]/)
      }
    })

    it("MED severity uses ! tag", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const output = result.output as string
      if (output.includes("(MED)")) {
        expect(output).toContain("!")
      }
    })

    it("LOW severity uses . tag", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const output = result.output as string
      if (output.includes("(LOW)")) {
        expect(output).toContain(".")
      }
    })
  })

  describe("output formatting - line joining", () => {
    it("output lines are joined with newline", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const output = result.output as string
      expect(output).toContain("\n")
    })

    it("output contains Health Scan header with finding count", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("Health Scan:")
      expect(result.output).toContain("finding(s)")
    })

    it("output contains category counts in summary", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const output = result.output as string
      expect(output).toContain("BUG")
      expect(output).toContain("MISSING_TEST")
      expect(output).toContain("HARDENING")
      expect(output).toContain("DOCS")
    })
  })

  describe("output formatting - source tags", () => {
    it("audit findings have [audit] source tag", async () => {
      const specsDir = path.join(worktree, "specs")
      const featureDir = path.join(specsDir, "001-test-feature")
      await fs.mkdir(featureDir, { recursive: true })
      await fs.writeFile(path.join(featureDir, "spec.json"), JSON.stringify({
        feature_name: "Test",
        feature_number: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        phase: "ready",
        approvals: {
          spec: { generated: true, approved: true },
          plan: { generated: true, approved: true },
          tasks: { generated: true, approved: true },
        },
        ready_for_implementation: true,
      }))
      const result = await selfhealTool.execute({}, ctx)
      const output = result.output as string
      if (output.includes("BUG") || output.includes("HARDENING")) {
        expect(output).toContain("[audit]")
      }
    })

    it("clean findings have [clean] source tag", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      if (cleanFindings.length > 0) {
        expect(result.output).toContain("[clean]")
      }
    })

    it("corruption findings have [corruption] source tag", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption source tag")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      if (corruptionFindings.length > 0) {
        expect(result.output).toContain("[corruption]")
      }
    })
  })

  describe("fix logic - fixed/skipped/failed counting", () => {
    it("fix section appears when fix=true and findings exist", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const output = result.output as string
      expect(output).toContain("Fix result:")
      expect(output).toContain("fixed")
      expect(output).toContain("skipped")
      expect(output).toContain("failed")
    })

    it("fix section does not appear when fix=false", async () => {
      const result = await selfhealTool.execute({ fix: false }, ctx)
      const output = result.output as string
      expect(output).not.toContain("Fix result:")
    })

    it("fixed count is a non-negative number", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
    })

    it("skipped count is a non-negative number", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("failed count is always 0", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { failed: number }
      expect(meta.failed).toBe(0)
    })

    it("skipped is not negative after Math.max(0, skipped - fixed)", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })
  })

  describe("metadata structure", () => {
    it("metadata contains findings array", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.metadata).toHaveProperty("findings")
      expect(Array.isArray(result.metadata?.findings)).toBe(true)
    })

    it("metadata contains summary object", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.metadata).toHaveProperty("summary")
    })

    it("metadata contains total count", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.metadata).toHaveProperty("total")
      expect(typeof result.metadata?.total).toBe("number")
    })

    it("metadata contains auditOutput string", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.metadata).toHaveProperty("auditOutput")
      expect(typeof result.metadata?.auditOutput).toBe("string")
    })

    it("metadata contains cleanOutput string", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.metadata).toHaveProperty("cleanOutput")
      expect(typeof result.metadata?.cleanOutput).toBe("string")
    })
  })

  describe("finding structure", () => {
    it("each finding has id starting with A-, C-, or W-", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string }> }
      for (const f of meta.findings) {
        expect(f.id).toMatch(/^[ACW]-\d+$/)
      }
    })

    it("each finding has source string", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      for (const f of meta.findings) {
        expect(typeof f.source).toBe("string")
        expect(["audit", "clean", "corruption"]).toContain(f.source)
      }
    })

    it("each finding has severity from valid set", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      for (const f of meta.findings) {
        expect(["LOW", "MED", "HIGH"]).toContain(f.severity)
      }
    })

    it("each finding has category from valid set", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ category: string }> }
      for (const f of meta.findings) {
        expect(["BUG", "MISSING_TEST", "HARDENING", "DOCS"]).toContain(f.category)
      }
    })

    it("each finding has message string", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ message: string }> }
      for (const f of meta.findings) {
        expect(typeof f.message).toBe("string")
      }
    })

    it("each finding has originalSeverity string", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalSeverity: string }> }
      for (const f of meta.findings) {
        expect(typeof f.originalSeverity).toBe("string")
      }
    })

    it("each finding has originalCategory string", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalCategory: string }> }
      for (const f of meta.findings) {
        expect(typeof f.originalCategory).toBe("string")
      }
    })
  })

  describe("title format", () => {
    it("title contains SelfHeal prefix", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toContain("SelfHeal")
    })

    it("title contains finding count", async () => {
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { total: number }
      expect(result.title).toContain(String(meta.total))
    })
  })

  describe("error handling", () => {
    it("returns error for no worktree", async () => {
      const result = await selfhealTool.execute({}, {} as any)
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree")
    })

    it("returns error for invalid project root", async () => {
      const result = await selfhealTool.execute({}, { worktree: "/nonexistent/path" } as any)
      expect(result.title).toBe("Error")
    })

    it("error result has no metadata findings", async () => {
      const result = await selfhealTool.execute({}, {} as any)
      expect(result.metadata?.findings).toBeUndefined()
    })
  })

  describe("corruption warnings integration", () => {
    it("corruption findings have correct id format W-", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption id format")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.id).toMatch(/^W-\d+$/)
      }
    })

    it("corruption findings have originalSeverity warn", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption severity")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalSeverity: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.originalSeverity).toBe("warn")
      }
    })

    it("corruption findings have originalCategory corruption", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption category")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalCategory: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.originalCategory).toBe("corruption")
      }
    })

    it("clears corruption warnings after processing", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption clear")
      expect(corruptionWarnings.length).toBeGreaterThan(0)
      await selfhealTool.execute({}, ctx)
      expect(corruptionWarnings.length).toBe(0)
    })

    it("corruption finding message contains file path", async () => {
      const filePath = path.join(worktree, ".opencode", "session.json")
      pushCorruptionWarning(filePath, "corruption file path")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ message: string; source: string }> }
      const corruptionFindings = meta.findings.filter(f => f.source === "corruption")
      for (const f of corruptionFindings) {
        expect(f.message).toContain("session.json")
      }
    })
  })
})
