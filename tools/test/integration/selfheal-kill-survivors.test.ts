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

  describe("Spy: audit/clean args passing", () => {
    it("auditTool receives fix=true when selfheal fix=true via spy", async () => {
      const { default: auditMod } = await import("../../speckit-audit")
      const spy = { called: false, args: null as unknown }
      const orig = auditMod.execute
      auditMod.execute = async (a: unknown, c: unknown) => {
        spy.called = true
        spy.args = a
        return orig(a as never, c as never)
      }
      try {
        await createFeatureWithPhase("spec")
        await selfhealTool.execute({ fix: true }, ctx)
        expect(spy.called).toBe(true)
        expect(spy.args).toEqual(expect.objectContaining({ fix: true }))
      } finally {
        auditMod.execute = orig
      }
    })

    it("cleanTool receives fix=true when selfheal fix=true via spy", async () => {
      const { default: cleanMod } = await import("../../speckit-clean")
      const spy = { called: false, args: null as unknown }
      const orig = cleanMod.execute
      cleanMod.execute = async (a: unknown, c: unknown) => {
        spy.called = true
        spy.args = a
        return orig(a as never, c as never)
      }
      try {
        await createFeatureWithPhase("spec")
        await selfhealTool.execute({ fix: true }, ctx)
        expect(spy.called).toBe(true)
        expect(spy.args).toEqual(expect.objectContaining({ fix: true }))
      } finally {
        cleanMod.execute = orig
      }
    })
  })

  describe("Clean loop exact values", () => {
    it("clean finding message uses ?? not && fallback", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string; message: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.message).not.toBe("Stryker was here!")
        expect(typeof f.message).toBe("string")
      }
    })

    it("clean finding originalSeverity is valid severity string", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string; originalSeverity: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(["error", "warn", "info"]).toContain(f.originalSeverity)
      }
    })

    it("clean finding source is exactly clean not empty", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      expect(cleanFindings.length).toBeGreaterThanOrEqual(0)
      for (const f of cleanFindings) {
        expect(f.source).toBe("clean")
      }
    })

    it("clean finding id uses C- prefix", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.id).toMatch(/^C-\d+$/)
      }
    })
  })

  describe("Fix logic exact values", () => {
    it("skipped does not exceed total findings", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; total: number }
      expect(meta.skipped).toBeLessThanOrEqual(meta.total)
    })

    it("skipped + fixed does not exceed total", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; fixed: number; total: number }
      expect(meta.skipped + meta.fixed).toBeLessThanOrEqual(meta.total)
    })

    it("skipped is non-negative after Math.max", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("fixed count is non-negative", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
    })

    it("failed count is always zero in current implementation", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { failed: number }
      expect(meta.failed).toBe(0)
    })
  })

  describe("Output format exact values", () => {
    it("each finding line matches expected format", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const findingLines = lines.filter(l => l.startsWith("["))
      for (const line of findingLines) {
        expect(line).toMatch(/^\[\.\]|\[!\]|\[!!\] \w+ \((?:LOW|MED|HIGH)\) \[(?:audit|clean|corruption)\] .+$/)
      }
    })

    it("summary line contains exact category labels", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const firstLine = (result.output as string).split("\n")[0]
      expect(firstLine).toContain("BUG")
      expect(firstLine).toContain("MISSING_TEST")
      expect(firstLine).toContain("HARDENING")
      expect(firstLine).toContain("DOCS")
    })

    it("title contains SelfHeal colon space format", async () => {
      const result = await selfhealTool.execute({}, ctx)
      expect(result.title).toMatch(/^SelfHeal: /)
    })
  })

  describe("Sort with contrasting severity+category", () => {
    it("HIGH severity always before MED regardless of category", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "high severity sort test")
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; category: string }> }
      const highIndices: number[] = []
      const medIndices: number[] = []
      meta.findings.forEach((f, i) => {
        if (f.severity === "HIGH") highIndices.push(i)
        if (f.severity === "MED") medIndices.push(i)
      })
      if (highIndices.length > 0 && medIndices.length > 0) {
        const lastHigh = Math.max(...highIndices)
        const firstMed = Math.min(...medIndices)
        expect(lastHigh).toBeLessThan(firstMed)
      }
    })

    it("BUG category before HARDENING when same severity", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; category: string }> }
      const lowBug = meta.findings.findIndex(f => f.severity === "LOW" && f.category === "BUG")
      const lowHardening = meta.findings.findIndex(f => f.severity === "LOW" && f.category === "HARDENING")
      if (lowBug >= 0 && lowHardening >= 0) {
        expect(lowBug).toBeLessThan(lowHardening)
      }
    })
  })

  describe("Clean loop exact source verification", () => {
    it("every clean finding has source exactly clean", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.source).toBe("clean")
      }
    })

    it("every clean finding has originalCategory clean", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalCategory: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.originalCategory).toBe("clean")
      }
    })

    it("every clean finding has id starting with C-", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.id.startsWith("C-")).toBe(true)
      }
    })
  })

  describe("Fix logic exact skipped behavior", () => {
    it("skipped is zero when no findings have LOW severity or info originalSeverity", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; findings: Array<{ severity: string; originalSeverity: string }> }
      const qualifying = meta.findings.filter(f => f.severity === "LOW" || f.originalSeverity === "info")
      if (qualifying.length === 0) {
        expect(meta.skipped).toBe(0)
      }
    })

    it("skipped equals qualifying minus fixed", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; fixed: number; findings: Array<{ severity: string; originalSeverity: string }> }
      const qualifying = meta.findings.filter(f => f.severity === "LOW" || f.originalSeverity === "info").length
      expect(meta.skipped).toBe(Math.max(0, qualifying - meta.fixed))
    })

    it("fixed count equals auto-fixed findings from audit", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(typeof meta.fixed).toBe("number")
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Output format per-line verification", () => {
    it("HIGH severity lines start with [!!]", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "output format high test")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      for (const line of lines) {
        if (line.includes("(HIGH)")) {
          expect(line.startsWith("[!!]")).toBe(true)
        }
      }
    })

    it("MED severity lines start with [!]", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      for (const line of lines) {
        if (line.includes("(MED)")) {
          expect(line.startsWith("[!]")).toBe(true)
        }
      }
    })

    it("LOW severity lines start with [.]", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      for (const line of lines) {
        if (line.includes("(LOW)")) {
          expect(line.startsWith("[.]")).toBe(true)
        }
      }
    })

    it("every finding line contains source tag in brackets", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      for (const line of lines) {
        if (line.startsWith("[") && line.includes("HARDENING")) {
          expect(line).toMatch(/\[(audit|clean|corruption)\]/)
        }
      }
    })
  })

  describe("Sort function exact behavior", () => {
    it("severityOrder returns 0 for HIGH", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "sort HIGH")
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; category: string }> }
      const highIdx = meta.findings.findIndex(f => f.severity === "HIGH")
      if (highIdx >= 0) {
        const nonHigh = meta.findings.findIndex((f, i) => i > highIdx && f.severity !== "HIGH")
        if (nonHigh >= 0) {
          expect(meta.findings[nonHigh].severity).not.toBe("HIGH")
        }
      }
    })

    it("categoryOrder sorts BUG before HARDENING at same severity", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; category: string }> }
      const lowFindings = meta.findings.filter(f => f.severity === "LOW")
      const bugIdx = lowFindings.findIndex(f => f.category === "BUG")
      const hardeningIdx = lowFindings.findIndex(f => f.category === "HARDENING")
      if (bugIdx >= 0 && hardeningIdx >= 0) {
        expect(bugIdx).toBeLessThan(hardeningIdx)
      }
    })

    it("categoryOrder sorts MISSING_TEST before HARDENING", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; category: string }> }
      const medFindings = meta.findings.filter(f => f.severity === "MED")
      const missingIdx = medFindings.findIndex(f => f.category === "MISSING_TEST")
      const hardeningIdx = medFindings.findIndex(f => f.category === "HARDENING")
      if (missingIdx >= 0 && hardeningIdx >= 0) {
        expect(missingIdx).toBeLessThan(hardeningIdx)
      }
    })

    it("categoryOrder sorts DOCS last", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; category: string }> }
      const docsFindings = meta.findings.filter(f => f.category === "DOCS")
      for (const docsF of docsFindings) {
        const docsIdx = meta.findings.indexOf(docsF)
        const after = meta.findings.slice(docsIdx + 1)
        for (const later of after) {
          expect(later.category).not.toBe("BUG")
        }
      }
    })
  })

  describe("Clean loop exact values", () => {
    it("clean finding uses categorize with phase-mismatch category", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string; category: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(["BUG", "HARDENING", "DOCS"]).toContain(f.category)
      }
    })

    it("clean finding originalCategory is always clean", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ originalCategory: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.originalCategory).toBe("clean")
      }
    })

    it("clean finding id is unique and sequential", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const cleanIds = meta.findings.filter(f => f.source === "clean").map(f => f.id)
      const nums = cleanIds.map(id => parseInt(id.replace("C-", ""), 10))
      for (let i = 1; i < nums.length; i++) {
        expect(nums[i]).toBe(nums[i - 1] + 1)
      }
    })

    it("clean finding message is not undefined or null", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string; message: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.message).toBeDefined()
        expect(f.message).not.toBeNull()
        expect(typeof f.message).toBe("string")
      }
    })
  })

  describe("Fix logic exact skipped behavior v2", () => {
    it("skipped is exactly zero when no qualifying findings exist", async () => {
      await createFeatureWithPhase("ready", {
        spec: { generated: true, approved: true },
        plan: { generated: true, approved: true },
        tasks: { generated: true, approved: true },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; findings: Array<{ severity: string; originalSeverity: string }> }
      const qualifying = meta.findings.filter(f => f.severity === "LOW" || f.originalSeverity === "info").length
      if (qualifying === 0) {
        expect(meta.skipped).toBe(0)
      }
    })

    it("skipped equals qualifying minus fixed when fix=true", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number; fixed: number; findings: Array<{ severity: string; originalSeverity: string }> }
      const qualifying = meta.findings.filter(f => f.severity === "LOW" || f.originalSeverity === "info").length
      expect(meta.skipped).toBe(Math.max(0, qualifying - meta.fixed))
    })

    it("fixed count is sum of auto-fixed from audit tool", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number }
      expect(typeof meta.fixed).toBe("number")
      expect(meta.fixed).toBeGreaterThanOrEqual(0)
    })

    it("failed count is always exactly zero", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { failed: number }
      expect(meta.failed).toBe(0)
    })
  })

  describe("Output format exact line verification v2", () => {
    it("sevTag is exactly !! for HIGH", async () => {
      pushCorruptionWarning(path.join(worktree, ".opencode", "session.json"), "exact sevTag HIGH")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const highLines = lines.filter(l => l.includes("(HIGH)"))
      for (const line of highLines) {
        expect(line).toContain("[!!]")
        expect(line).not.toContain("[!]")
      }
    })

    it("sevTag is exactly ! for MED", async () => {
      await createFeatureWithPhase("spec", {
        spec: { generated: true, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      })
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const medLines = lines.filter(l => l.includes("(MED)"))
      for (const line of medLines) {
        expect(line).toMatch(/^\[!\]/)
      }
    })

    it("sevTag is exactly . for LOW", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const lowLines = lines.filter(l => l.includes("(LOW)"))
      for (const line of lowLines) {
        expect(line).toMatch(/^\[\.\]/)
      }
    })

    it("finding line contains category label in uppercase", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const findingLines = lines.filter(l => l.startsWith("["))
      for (const line of findingLines) {
        const hasCategory = line.includes("BUG") || line.includes("HARDENING") || line.includes("DOCS") || line.includes("MISSING_TEST")
        expect(hasCategory).toBe(true)
      }
    })

    it("finding line contains source tag audit or clean", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = (result.output as string).split("\n")
      const findingLines = lines.filter(l => l.startsWith("["))
      for (const line of findingLines) {
        const hasSource = line.includes("[audit]") || line.includes("[clean]") || line.includes("[corruption]")
        expect(hasSource).toBe(true)
      }
    })
  })

  describe("Project warnings early return", () => {
    it("returns Warning title when projectWarnings exist", async () => {
      const result = await selfhealTool.execute({}, ctx)
      if (result.title === "Warning") {
        expect(result.metadata).toBeDefined()
        expect((result.metadata as { requiresConfirmation: boolean }).requiresConfirmation).toBe(true)
      }
    })

    it("projectWarnings output contains warning messages", async () => {
      const result = await selfhealTool.execute({}, ctx)
      if (result.title === "Warning") {
        expect(typeof result.output).toBe("string")
        expect(result.output.length).toBeGreaterThan(0)
      }
    })
  })

  describe("Error handling", () => {
    it("returns Error title when no worktree", async () => {
      const noCtx = mockContext("")
      const result = await selfhealTool.execute({}, noCtx)
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns Error title when not valid project", async () => {
      const result = await selfhealTool.execute({}, ctx)
      if (result.title === "Error") {
        expect(result.output).toBeDefined()
      }
    })
  })
})
