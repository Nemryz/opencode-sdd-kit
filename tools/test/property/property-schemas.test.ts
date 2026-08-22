import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { SessionStateSchema, SpecJsonSchema, ConfigSchema } from "../../shared/schemas"
import {
  arbitrarySessionState,
  arbitrarySpecJson,
  arbitrarySDDConfig,
  arbitraryInvalidSessionState,
  arbitraryInvalidSpecJson,
  arbitraryInvalidSDDConfig,
} from "./arbitraries"

describe("Property: SessionStateSchema accepts valid inputs", () => {
  it("for every arbitrary SessionState, safeParse succeeds", () => {
    fc.assert(
      fc.property(arbitrarySessionState(), (raw) => {
        const result = SessionStateSchema.safeParse(raw)
        expect(result.success).toBe(true)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: SessionStateSchema rejects invalid inputs", () => {
  it("for every arbitrary invalid SessionState, safeParse fails", () => {
    fc.assert(
      fc.property(arbitraryInvalidSessionState(), (raw) => {
        const result = SessionStateSchema.safeParse(raw)
        expect(result.success).toBe(false)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: SpecJsonSchema accepts valid inputs", () => {
  it("for every arbitrary SpecJson, safeParse succeeds", () => {
    fc.assert(
      fc.property(arbitrarySpecJson(), (raw) => {
        const result = SpecJsonSchema.safeParse(raw)
        expect(result.success).toBe(true)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: SpecJsonSchema rejects invalid inputs", () => {
  it("for every arbitrary invalid SpecJson, safeParse fails", () => {
    fc.assert(
      fc.property(arbitraryInvalidSpecJson(), (raw) => {
        const result = SpecJsonSchema.safeParse(raw)
        expect(result.success).toBe(false)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: ConfigSchema accepts valid inputs", () => {
  it("for every arbitrary SDDConfig, safeParse succeeds", () => {
    fc.assert(
      fc.property(arbitrarySDDConfig(), (raw) => {
        const result = ConfigSchema.safeParse(raw)
        expect(result.success).toBe(true)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: ConfigSchema rejects invalid inputs", () => {
  it("for every arbitrary invalid SDDConfig, safeParse fails", () => {
    fc.assert(
      fc.property(arbitraryInvalidSDDConfig(), (raw) => {
        const result = ConfigSchema.safeParse(raw)
        expect(result.success).toBe(false)
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: SessionStateSchema roundtrip through JSON", () => {
  it("parse → stringify → parse returns same data", () => {
    fc.assert(
      fc.property(arbitrarySessionState(), (raw) => {
        const first = SessionStateSchema.safeParse(raw)
        if (!first.success) return

        const json = JSON.stringify(first.data)
        const parsed = JSON.parse(json)
        const second = SessionStateSchema.safeParse(parsed)

        expect(second.success).toBe(true)
        if (second.success) {
          expect(second.data).toEqual(first.data)
        }
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: SpecJsonSchema roundtrip through JSON", () => {
  it("parse → stringify → parse returns same data", () => {
    fc.assert(
      fc.property(arbitrarySpecJson(), (raw) => {
        const first = SpecJsonSchema.safeParse(raw)
        if (!first.success) return

        const json = JSON.stringify(first.data)
        const parsed = JSON.parse(json)
        const second = SpecJsonSchema.safeParse(parsed)

        expect(second.success).toBe(true)
        if (second.success) {
          expect(second.data).toEqual(first.data)
        }
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: ConfigSchema roundtrip through JSON", () => {
  it("parse → stringify → parse returns same data", () => {
    fc.assert(
      fc.property(arbitrarySDDConfig(), (raw) => {
        const first = ConfigSchema.safeParse(raw)
        if (!first.success) return

        const json = JSON.stringify(first.data)
        const parsed = JSON.parse(json)
        const second = ConfigSchema.safeParse(parsed)

        expect(second.success).toBe(true)
        if (second.success) {
          expect(second.data).toEqual(first.data)
        }
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: Schema stripping removes unknown fields", () => {
  it("SessionStateSchema strips unknown fields", () => {
    fc.assert(
      fc.property(arbitrarySessionState(), fc.dictionary(fc.string(), fc.jsonValue()), (raw, extra) => {
        const withExtra = { ...raw, ...extra }
        const result = SessionStateSchema.safeParse(withExtra)
        expect(result.success).toBe(true)
        if (result.success) {
          const keys = Object.keys(result.data)
          const knownKeys = ["command", "phase", "featureDir", "featureNumber", "featureName", "nextStep", "lastResult", "history"]
          for (const key of keys) {
            expect(knownKeys).toContain(key)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
