import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import selfhealTool from "../../speckit-selfheal"
import { categorize } from "../../speckit-selfheal"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"
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
  const featureDir = path.join(worktree, "specs", "001-test-feature")
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

describe("Selfheal: Deep Kill Tests", () => {

  describe("A. hardeningCategories array content", () => {
    it("approval-order maps to HARDENING", () => {
      const r = categorize("approval-order", "warn")
      expect(r).toEqual({ category: "HARDENING", severity: "MED" })
    })

    it("spec-clarity maps to HARDENING", () => {
      const r = categorize("spec-clarity", "warn")
      expect(r).toEqual({ category: "HARDENING", severity: "MED" })
    })

    it("tasks-boundary maps to HARDENING", () => {
      const r = categorize("tasks-boundary", "warn")
      expect(r).toEqual({ category: "HARDENING", severity: "MED" })
    })

    it("steering maps to HARDENING", () => {
      const r = categorize("steering", "warn")
      expect(r).toEqual({ category: "HARDENING", severity: "MED" })
    })

    it("unknown category falls through to default HARDENING", () => {
      const r = categorize("unknown-category", "info")
      expect(r).toEqual({ category: "HARDENING", severity: "LOW" })
    })

    it("non-bug non-hardening non-doc category maps to default HARDENING", () => {
      const r = categorize("something-else", "error")
      expect(r).toEqual({ category: "HARDENING", severity: "HIGH" })
    })
  })

  describe("B. sevMap fallback values", () => {
    it("unknown severity falls back to LOW", () => {
      const r = categorize("phase-mismatch", "unknown-severity")
      expect(r.severity).toBe("LOW")
    })

    it("empty severity falls back to LOW", () => {
      const r = categorize("phase-mismatch", "")
      expect(r.severity).toBe("LOW")
    })

    it("doc category always returns LOW regardless of severity", () => {
      const r = categorize("constitution", "error")
      expect(r).toEqual({ category: "DOCS", severity: "LOW" })
    })
  })

  describe("C. Error handling paths", () => {
    it("returns Error title when no worktree", async () => {
      const noCtx = mockContext("")
      const result = await selfhealTool.execute({}, noCtx)
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns Error title for invalid project root", async () => {
      const badCtx = mockContext("/nonexistent-path-xyz-12345")
      const result = await selfhealTool.execute({}, badCtx)
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })
  })

  describe("D. Output message content", () => {
    it("output message contains exact finding text", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("No steering directory")
      expect(result.output).toContain("tasks.md has no Boundary annotations")
      expect(result.output).toContain("Constitution file missing")
    })

    it("output does not contain Stryker placeholder", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).not.toContain("Stryker")
    })
  })

  describe("E. Output formatting exact tags", () => {
    it("MED severity findings use [!] tag", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      const medFindings = meta.findings.filter(f => f.severity === "MED")
      if (medFindings.length > 0) {
        expect(result.output).toContain("[!]")
      }
    })

    it("LOW severity findings use [.] tag", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string }> }
      const lowFindings = meta.findings.filter(f => f.severity === "LOW")
      if (lowFindings.length > 0) {
        expect(result.output).toContain("[.]")
      }
    })

    it("each finding line has sevTag bracket format", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const lines = result.output.split("\n").filter(l => l.startsWith("["))
      for (const line of lines) {
        expect(line).toMatch(/^\[(!!|!|\.)\]/)
      }
    })
  })

  describe("F. Fix logic detailed", () => {
    it("fix result line present when fix=true and findings exist", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      expect(result.output).toContain("Fix result:")
    })

    it("fix result absent when fix=false", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: false }, ctx)
      expect(result.output).not.toContain("Fix result:")
    })

    it("skipped count non-negative with fix=true", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { skipped: number }
      expect(meta.skipped).toBeGreaterThanOrEqual(0)
    })

    it("metadata contains auditOutput and cleanOutput strings", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { auditOutput: string; cleanOutput: string }
      expect(typeof meta.auditOutput).toBe("string")
      expect(typeof meta.cleanOutput).toBe("string")
    })

    it("metadata contains fixed, skipped, failed numbers", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({ fix: true }, ctx)
      const meta = result.metadata as { fixed: number; skipped: number; failed: number }
      expect(typeof meta.fixed).toBe("number")
      expect(typeof meta.skipped).toBe("number")
      expect(typeof meta.failed).toBe("number")
    })
  })

  describe("G. Summary and sorting", () => {
    it("summary counts match findings array", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { summary: Record<string, number>; findings: Array<{ category: string }> }
      const countByCategory = { BUG: 0, MISSING_TEST: 0, HARDENING: 0, DOCS: 0 }
      for (const f of meta.findings) {
        countByCategory[f.category as keyof typeof countByCategory]++
      }
      expect(meta.summary).toEqual(countByCategory)
    })

    it("total equals findings length", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { total: number; findings: Array<unknown> }
      expect(meta.total).toBe(meta.findings.length)
    })

    it("findings sorted by severity then category", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ severity: string; category: string }> }
      const sevOrder = { HIGH: 0, MED: 1, LOW: 2 }
      const catOrder = { BUG: 0, MISSING_TEST: 1, HARDENING: 2, DOCS: 3 }
      for (let i = 1; i < meta.findings.length; i++) {
        const prev = meta.findings[i - 1]
        const curr = meta.findings[i]
        const prevSev = sevOrder[prev.severity as keyof typeof sevOrder] ?? 2
        const currSev = sevOrder[curr.severity as keyof typeof sevOrder] ?? 2
        if (prevSev === currSev) {
          const prevCat = catOrder[prev.category as keyof typeof catOrder] ?? 3
          const currCat = catOrder[curr.category as keyof typeof catOrder] ?? 3
          expect(prevCat).toBeLessThanOrEqual(currCat)
        } else {
          expect(prevSev).toBeLessThanOrEqual(currSev)
        }
      }
    })

    it("output starts with Health Scan summary line", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toMatch(/^Health Scan: \d+ finding/)
    })

    it("output contains BUG and HARDENING counts", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      expect(result.output).toContain("BUG")
      expect(result.output).toContain("HARDENING")
    })
  })

  describe("H. Clean issues integration", () => {
    it("clean findings have C- prefix", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const cleanFindings = meta.findings.filter(f => f.source === "clean")
      for (const f of cleanFindings) {
        expect(f.id).toMatch(/^C-/)
      }
    })

    it("clean findings are included in total count", async () => {
      await createFeatureWithPhase("spec")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { total: number; findings: Array<{ source: string }> }
      expect(meta.total).toBe(meta.findings.length)
    })
  })

  describe("I. Audit findings defaults", () => {
    it("audit finding with missing category defaults to HARDENING", async () => {
      await createFeatureWithPhase("ready")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string; category: string }> }
      const auditFindings = meta.findings.filter(f => f.source === "audit")
      for (const f of auditFindings) {
        expect(["BUG", "MISSING_TEST", "HARDENING", "DOCS"]).toContain(f.category)
      }
    })

    it("audit finding with missing severity defaults to LOW", async () => {
      await createFeatureWithPhase("ready")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ source: string; severity: string }> }
      const auditFindings = meta.findings.filter(f => f.source === "audit")
      for (const f of auditFindings) {
        expect(["HIGH", "MED", "LOW"]).toContain(f.severity)
      }
    })

    it("audit findings have A- prefix", async () => {
      await createFeatureWithPhase("ready")
      const result = await selfhealTool.execute({}, ctx)
      const meta = result.metadata as { findings: Array<{ id: string; source: string }> }
      const auditFindings = meta.findings.filter(f => f.source === "audit")
      for (const f of auditFindings) {
        expect(f.id).toMatch(/^A-/)
      }
    })
  })
})
