import { describe, it, expect } from "vitest"
import {
  parseNNN,
  detectPhase,
  detectPhaseFromFiles,
  isENOENT,
  parsePhase,
  makeSpecJson,
  PHASE_NEXT_STEP,
} from "../../shared/types"

// ── parseNNN ────────────────────────────────────────────────

describe("parseNNN", () => {
  it("extracts number from prefixed directory name", () => {
    expect(parseNNN("001-foo")).toBe(1)
  })

  it("handles multi-digit numbers", () => {
    expect(parseNNN("999-bar")).toBe(999)
  })

  it("returns 0 for names without a number prefix", () => {
    expect(parseNNN("abc")).toBe(0)
  })

  it("returns 0 for empty string", () => {
    expect(parseNNN("")).toBe(0)
  })

  it("returns 0 when no dash follows the number", () => {
    expect(parseNNN("123")).toBe(0)
  })
})

// ── detectPhase ──────────────────────────────────────────────

describe("detectPhase", () => {
  it("returns init when constitution is missing", () => {
    const r = detectPhase(false, false, false, false)
    expect(r.phase).toBe("init")
    expect(r.nextStep).toContain("/spec")
  })

  it("returns spec when constitution exists but no spec file", () => {
    const r = detectPhase(false, true, true, true)
    expect(r.phase).toBe("spec")
  })

  it("returns plan when spec exists but no plan file", () => {
    const r = detectPhase(true, false, true, true)
    expect(r.phase).toBe("plan")
  })

  it("returns tasks when spec and plan exist but no tasks file", () => {
    const r = detectPhase(true, true, false, true)
    expect(r.phase).toBe("tasks")
  })

  it("returns ready when all artifacts exist with constitution", () => {
    const r = detectPhase(true, true, true, true)
    expect(r.phase).toBe("ready")
    expect(r.nextStep).toContain("/impl")
  })
})

// ── detectPhaseFromFiles ─────────────────────────────────────

describe("detectPhaseFromFiles", () => {
  it("returns spec when spec.md is missing", () => {
    expect(detectPhaseFromFiles(false, false, false)).toBe("spec")
  })

  it("returns plan when only spec.md exists", () => {
    expect(detectPhaseFromFiles(true, false, false)).toBe("plan")
  })

  it("returns tasks when spec and plan exist", () => {
    expect(detectPhaseFromFiles(true, true, false)).toBe("tasks")
  })

  it("returns ready when all files exist", () => {
    expect(detectPhaseFromFiles(true, true, true)).toBe("ready")
  })
})

// ── isENOENT ────────────────────────────────────────────────

describe("isENOENT", () => {
  it("returns true for an error with code ENOENT", () => {
    const err = new Error("not found")
    ;(err as NodeJS.ErrnoException).code = "ENOENT"
    expect(isENOENT(err)).toBe(true)
  })

  it("returns false for an error with a different code", () => {
    const err = new Error("permission denied")
    ;(err as NodeJS.ErrnoException).code = "EACCES"
    expect(isENOENT(err)).toBe(false)
  })

  it("returns false for a non-Error value", () => {
    expect(isENOENT("some string")).toBe(false)
  })

  it("returns false for null", () => {
    expect(isENOENT(null)).toBe(false)
  })

  it("returns false for an Error without a code property", () => {
    expect(isENOENT(new Error("generic"))).toBe(false)
  })
})

// ── parsePhase ──────────────────────────────────────────────

describe("parsePhase", () => {
  it("returns the phase for each valid phase value", () => {
    const valid: string[] = ["spec", "plan", "tasks", "ready", "impl", "complete"]
    for (const p of valid) {
      expect(parsePhase(p)).toBe(p)
    }
  })

  it("falls back to spec for invalid strings", () => {
    expect(parsePhase("invalid")).toBe("spec")
  })

  it("falls back to spec for empty string", () => {
    expect(parsePhase("")).toBe("spec")
  })
})

// ── makeSpecJson ────────────────────────────────────────────

describe("makeSpecJson", () => {
  it("returns an object with the correct feature name", () => {
    const sj = makeSpecJson("my feature", 3)
    expect(sj.feature_name).toBe("my feature")
  })

  it("returns an object with the correct feature number", () => {
    const sj = makeSpecJson("my feature", 3)
    expect(sj.feature_number).toBe(3)
  })

  it("starts in spec phase with ready_for_implementation false", () => {
    const sj = makeSpecJson("test", 1)
    expect(sj.phase).toBe("spec")
    expect(sj.ready_for_implementation).toBe(false)
  })

  it("sets all approvals to generated=false and approved=false", () => {
    const sj = makeSpecJson("test", 1)
    expect(sj.approvals.spec).toEqual({ generated: false, approved: false })
    expect(sj.approvals.plan).toEqual({ generated: false, approved: false })
    expect(sj.approvals.tasks).toEqual({ generated: false, approved: false })
  })

  it("sets created_at and updated_at to valid ISO strings", () => {
    const sj = makeSpecJson("test", 1)
    expect(() => new Date(sj.created_at)).not.toThrow()
    expect(() => new Date(sj.updated_at)).not.toThrow()
  })
})

// ── PHASE_NEXT_STEP ─────────────────────────────────────────

describe("PHASE_NEXT_STEP", () => {
  it("has an entry for every expected phase", () => {
    const expected = ["init", "spec", "plan", "tasks", "ready", "impl", "complete"]
    for (const phase of expected) {
      expect(PHASE_NEXT_STEP[phase]).toBeDefined()
      expect(typeof PHASE_NEXT_STEP[phase]).toBe("string")
    }
  })
})
