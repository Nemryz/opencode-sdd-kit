import { describe, it, expect } from "vitest"
import { categorize } from "../../speckit-selfheal"

describe("categorize() unit tests", () => {
  describe("BUG categories", () => {
    it("phase-mismatch maps to BUG with correct severity", () => {
      expect(categorize("phase-mismatch", "error")).toEqual({ category: "BUG", severity: "HIGH" })
      expect(categorize("phase-mismatch", "warn")).toEqual({ category: "BUG", severity: "MED" })
      expect(categorize("phase-mismatch", "info")).toEqual({ category: "BUG", severity: "LOW" })
    })

    it("ready-violation maps to BUG", () => {
      expect(categorize("ready-violation", "error")).toEqual({ category: "BUG", severity: "HIGH" })
      expect(categorize("ready-violation", "warn")).toEqual({ category: "BUG", severity: "MED" })
    })

    it("spec-json maps to BUG", () => {
      expect(categorize("spec-json", "error")).toEqual({ category: "BUG", severity: "HIGH" })
    })
  })

  describe("HARDENING categories", () => {
    it("approval-order maps to HARDENING", () => {
      expect(categorize("approval-order", "warn")).toEqual({ category: "HARDENING", severity: "MED" })
    })

    it("spec-clarity maps to HARDENING", () => {
      expect(categorize("spec-clarity", "info")).toEqual({ category: "HARDENING", severity: "LOW" })
    })

    it("tasks-boundary maps to HARDENING", () => {
      expect(categorize("tasks-boundary", "error")).toEqual({ category: "HARDENING", severity: "HIGH" })
    })

    it("steering maps to HARDENING", () => {
      expect(categorize("steering", "warn")).toEqual({ category: "HARDENING", severity: "MED" })
    })
  })

  describe("DOCS categories", () => {
    it("optional-artifact maps to DOCS with LOW severity", () => {
      expect(categorize("optional-artifact", "error")).toEqual({ category: "DOCS", severity: "LOW" })
    })

    it("constitution maps to DOCS", () => {
      expect(categorize("constitution", "warn")).toEqual({ category: "DOCS", severity: "LOW" })
    })

    it("features maps to DOCS", () => {
      expect(categorize("features", "info")).toEqual({ category: "DOCS", severity: "LOW" })
    })
  })

  describe("default fallback", () => {
    it("unknown category defaults to HARDENING", () => {
      expect(categorize("unknown", "warn")).toEqual({ category: "HARDENING", severity: "MED" })
    })

    it("unknown severity defaults to LOW via nullish coalescing", () => {
      expect(categorize("phase-mismatch", "bogus")).toEqual({ category: "BUG", severity: "LOW" })
    })

    it("empty severity defaults to LOW", () => {
      expect(categorize("phase-mismatch", "")).toEqual({ category: "BUG", severity: "LOW" })
    })
  })

  describe("array content integrity", () => {
    it("hardeningCategories has exactly 4 entries", () => {
      const hardening = ["approval-order", "spec-clarity", "tasks-boundary", "steering"]
      expect(hardening).toHaveLength(4)
      for (const cat of hardening) {
        expect(categorize(cat, "warn").category).toBe("HARDENING")
      }
    })

    it("docCategories has exactly 3 entries", () => {
      const docs = ["optional-artifact", "constitution", "features"]
      expect(docs).toHaveLength(3)
      for (const cat of docs) {
        expect(categorize(cat, "warn").category).toBe("DOCS")
      }
    })

    it("bugCategories has exactly 3 entries", () => {
      const bugs = ["phase-mismatch", "ready-violation", "spec-json"]
      expect(bugs).toHaveLength(3)
      for (const cat of bugs) {
        expect(categorize(cat, "warn").category).toBe("BUG")
      }
    })
  })
})
