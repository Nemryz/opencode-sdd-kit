import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { parsePhase } from "../../shared/schemas"
import { parseNNN } from "../../shared/types"
import { slugify } from "../helpers/slugify"
import { arbitraryValidPhase } from "./arbitraries"

describe("Property: parsePhase is idempotent for valid phases", () => {
  it("for every valid phase, parsePhase(phase) === phase", () => {
    fc.assert(
      fc.property(arbitraryValidPhase(), (phase) => {
        const result = parsePhase(phase)
        expect(result).toBe(phase)
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property: parsePhase always returns a valid phase", () => {
  it("for every string, parsePhase(s) is a valid phase", () => {
    const validPhases = ["spec", "plan", "tasks", "ready", "impl", "complete"]
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = parsePhase(s)
        expect(validPhases).toContain(result)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: parsePhase('init') returns 'spec'", () => {
  it("parsePhase('init') always returns 'spec'", () => {
    expect(parsePhase("init")).toBe("spec")
  })
})

describe("Property: parsePhase is deterministic", () => {
  it("for every string, parsePhase(s) === parsePhase(s)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const first = parsePhase(s)
        const second = parsePhase(s)
        expect(first).toBe(second)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: slugify is idempotent", () => {
  it("for every string not starting with digit, slugify(slugify(s).slug).slug === slugify(s).slug", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !/^\d/.test(s)),
        (s) => {
          const first = slugify(s)
          const second = slugify(first.slug)
          expect(first.slug).toBe(second.slug)
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe("Property: slugify output is always lowercase", () => {
  it("for every string, slugify(s).slug is lowercase", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (s) => {
        const result = slugify(s)
        expect(result.slug).toBe(result.slug.toLowerCase())
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: slugify output contains only safe characters", () => {
  it("for every string, slugify(s).slug matches [a-z0-9-]", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (s) => {
        const result = slugify(s)
        expect(result.slug).toMatch(/^[a-z0-9-]*$/)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: slugify respects maxLen", () => {
  it("for every non-empty-result string and maxLen, slug matches maxLen", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 7, max: 100 }),
        (s, maxLen) => {
          const result = slugify(s, maxLen)
          if (result.slug !== "unnamed") {
            expect(result.slug.length).toBeLessThanOrEqual(maxLen)
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe("Property: parseNNN extracts leading digits", () => {
  it("for every string starting with digits, parseNNN returns the number", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9999 }),
        fc.string({ minLength: 0, maxLength: 20 }),
        (num, suffix) => {
          const dirName = `${num}-${suffix || "feature"}`
          const result = parseNNN(dirName)
          expect(result).toBe(num)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("for strings without leading digits, parseNNN returns 0", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]/), (s) => {
        const result = parseNNN(s)
        expect(result).toBe(0)
      }),
      { numRuns: 100 }
    )
  })
})
