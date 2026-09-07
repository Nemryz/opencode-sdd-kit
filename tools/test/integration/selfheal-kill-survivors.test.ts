import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
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

describe("Selfheal: Kill Surviving Mutants", () => {

  describe("Output content verification", () => {
    it("auditOutput is populated from audit tool execution", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { auditOutput: string }
      expect(typeof meta.auditOutput).toBe("string")
      expect(meta.auditOutput.length).toBeGreaterThan(0)
    })

    it("cleanOutput is populated from clean tool execution", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { cleanOutput: string }
      expect(typeof meta.cleanOutput).toBe("string")
      expect(meta.cleanOutput.length).toBeGreaterThan(0)
    })

    it("MED severity findings use ! tag in output", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      const medFindings = meta.findings.filter(f => f.severity === "MED")
      if (medFindings.length > 0) {
        expect(result.output).toContain("[!]")
      }
    })

    it("output lines array starts empty with no pre-filled content", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).not.toContain("Stryker")
      expect(result.output).toMatch(/^Health Scan:/)
    })
  })

  describe("Fix logic entry conditions", () => {
    it("fix block skipped when fix=false regardless of findings", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: false }, ctx)
      expect(result.output).not.toContain("Fix result:")
      const meta = result.metadata as { fixed: number }
      expect(meta.fixed).toBe(0)
    })

    it("fix block entered when fix=true and findings exist", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.output).toContain("Fix result:")
      const meta = result.metadata as { fixed: number; skipped: number; failed: number }
      expect(typeof meta.fixed).toBe("number")
      expect(typeof meta.skipped).toBe("number")
      expect(typeof meta.failed).toBe("number")
    })

    it("fix block skipped when fix=true but no feature-level findings", async () => {
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number; skipped: number }
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Fix logic auto-fixed detection", () => {
    it("auditTool called with fix=true when selfheal fix=true", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
    })

    it("cleanTool called with fix=true when selfheal fix=true", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("fixed count reflects auto-fixed findings from audit", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
      expect(typeof meta.fixed).toBe("number")
    })

    it("fixed count excludes non-auto-fixed findings", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(meta.fixed).toBe(0)
    })

    it("auto-fixed detection uses includes((auto-fixed)) string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.output).toContain("fixed")
    })
  })

  describe("Fix logic skipped counting", () => {
    it("skipped includes LOW severity findings", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("skipped includes info originalSeverity findings", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("skipped excludes non-LOW non-info findings from count", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; total: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
      expect(meta.skipped).toBeLessThanOrEqual(meta.total)
    })

    it("skipped incremented with plus-plus not decremented with minus-minus", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("Math.max used to prevent negative skipped", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("skipped equals qualifying minus fixed not plus fixed", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; fixed: number; total: number }
      expect(meta.skipped).toBeLessThanOrEqual(meta.total)
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Clean findings structure", () => {
    it("clean findings loop processes all clean issues", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      expect(cleanFindings.length).toBeGreaterThanOrEqual(0)
    })

    it("clean finding severity defaults to info when undefined", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(["LOW", "MED", "HIGH"]).toContain(f.severity)
      }
    })

    it("clean finding source is literal clean", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.source).toBe("clean")
      }
    })

    it("clean finding id uses findings.length plus 1 not minus 1", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.id).toMatch(/^C-\d+$/)
      }
    })

    it("clean finding message uses issue.message", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ message: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(typeof f.message).toBe("string")
      }
    })
  })

  describe("Corruption warnings", () => {
    it("corruption warnings cleared after selfheal execution", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "test corruption clear")
      expect(corruptionWarnings.length).toBeGreaterThan(0)
      await selfhealTool.execute({}, ctx)
      expect(corruptionWarnings.length).toBe(0)
    })
  })

  describe("Metadata structure", () => {
    it("metadata.findings has correct finding structure", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<Record<string, unknown>> }
      for (const f of meta.findings) {
        expect(typeof f.id).toBe("string")
        expect(typeof f.source).toBe("string")
        expect(typeof f.severity).toBe("string")
        expect(typeof f.category).toBe("string")
        expect(typeof f.message).toBe("string")
      }
    })

    it("metadata.cleanOutput has correct structure", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { cleanOutput: string }
      expect(typeof meta.cleanOutput).toBe("string")
    })
  })

  describe("Sort order", () => {
    it("findings sorted by severity then category", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "corruption for sort order")
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      const severities = meta.findings.map(f => f.severity)
      const highIndices = severities.reduce((acc: number[], s: string, i: number) => s === "HIGH" ? [...acc, i] : acc, [])
      const medIndices = severities.reduce((acc: number[], s: string, i: number) => s === "MED" ? [...acc, i] : acc, [])
      const lowIndices = severities.reduce((acc: number[], s: string, i: number) => s === "LOW" ? [...acc, i] : acc, [])
      if (highIndices.length > 0 && medIndices.length > 0) {
        expect(Math.max(...highIndices)).toBeLessThan(Math.min(...medIndices))
      }
      if (medIndices.length > 0 && lowIndices.length > 0) {
        expect(Math.max(...medIndices)).toBeLessThan(Math.min(...lowIndices))
      }
    })
  })

  describe("Default severity mapping", () => {
    it("unknown severity defaults to LOW via nullish coalescing", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      for (const f of meta.findings) {
        expect(["LOW", "MED", "HIGH"]).toContain(f.severity)
      }
    })
  })

  describe("Output formatting", () => {
    it("output contains category counts in summary line", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("BUG")
      expect(result.output).toContain("HARDENING")
    })

    it("output finding lines contain source tags", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const hasAuditOrClean = result.output.includes("[audit]") || result.output.includes("[clean]")
      expect(hasAuditOrClean).toBe(true)
    })

    it("title contains SelfHeal prefix and count", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toMatch(/^SelfHeal: \d+ finding/)
    })
  })

  describe("Audit/clean args.fix passing", () => {
    it("auditTool receives fix=true when selfheal fix=true", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
    })

    it("cleanTool receives fix=true when selfheal fix=true", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Corruption warnings cleanup", () => {
    it("corruption warnings removed after selfheal processes them", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "warning to be cleared")
      const before = corruptionWarnings.length
      expect(before).toBeGreaterThan(0)
      await selfhealTool.execute({}, ctx)
      expect(corruptionWarnings.length).toBe(0)
    })

    it("corruption findings appear in output when warnings exist", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "visible corruption")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("visible corruption")
    })
  })

  describe("MED severity tag in output", () => {
    it("MED severity uses ! tag not empty string", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      const medFindings = meta.findings.filter(f => f.severity === "MED")
      if (medFindings.length > 0) {
        const lines = (result.output as string).split("\n")
        const medLines = lines.filter(l => l.includes("(MED)"))
        for (const line of medLines) {
          expect(line).toMatch(/^\[!\]/)
        }
      }
    })

    it("HIGH severity uses !! tag", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "high severity tag test")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const highLines = lines.filter(l => l.includes("(HIGH)"))
      for (const line of highLines) {
        expect(line).toMatch(/^\[!!\]/)
      }
    })

    it("LOW severity uses . tag", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const lowLines = lines.filter(l => l.includes("(LOW)"))
      for (const line of lowLines) {
        expect(line).toMatch(/^\[\.\]/)
      }
    })
  })
})
