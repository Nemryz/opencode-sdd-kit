import path from "node:path"
import os from "node:os"
import { describe, it, expect } from "vitest"
import {
  parseNNN,
  detectPhase,
  detectPhaseFromFiles,
  isENOENT,
  isEEXIST,
  isValidProjectRoot,
  parsePhase,
  makeSpecJson,
  PHASE_NEXT_STEP,
  DEFAULT_SESSION,
  DEFAULT_CONFIG,
  sessionPath,
  configPath,
  constitutionPath,
  specJsonPath,
  specsDirPath,
  steeringDirPath,
  productSteeringPath,
  techSteeringPath,
  structureSteeringPath,
  SpecJsonSchema,
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

// ── isEEXIST ───────────────────────────────────────────────

describe("isEEXIST", () => {
  it("returns true for an error with code EEXIST", () => {
    const err = new Error("already exists")
    ;(err as NodeJS.ErrnoException).code = "EEXIST"
    expect(isEEXIST(err)).toBe(true)
  })

  it("returns false for an error with a different code", () => {
    const err = new Error("not found")
    ;(err as NodeJS.ErrnoException).code = "ENOENT"
    expect(isEEXIST(err)).toBe(false)
  })

  it("returns false for a non-Error value", () => {
    expect(isEEXIST("some string")).toBe(false)
  })

  it("returns false for null", () => {
    expect(isEEXIST(null)).toBe(false)
  })

  it("returns false for an Error without a code property", () => {
    expect(isEEXIST(new Error("generic"))).toBe(false)
  })
})

// ── isValidProjectRoot ─────────────────────────────────────

describe("isValidProjectRoot", () => {
  it("rejects the config directory", () => {
    const configDir = path.join(os.homedir(), ".config", "opencode")
    expect(isValidProjectRoot(configDir)).toBe(false)
  })

  it("accepts any other directory", () => {
    expect(isValidProjectRoot("/some/project")).toBe(true)
  })

  it("accepts the homedir itself", () => {
    expect(isValidProjectRoot(os.homedir())).toBe(true)
  })
})

// ── Path helpers ───────────────────────────────────────────

describe("sessionPath", () => {
  it("joins root with .opencode/spec-memory/session.json", () => {
    const r = path.resolve("/root")
    expect(sessionPath(r)).toBe(path.join(r, ".opencode", "spec-memory", "session.json"))
  })
})

describe("configPath", () => {
  it("joins root with .opencode/spec-memory/config.json", () => {
    const r = path.resolve("/root")
    expect(configPath(r)).toBe(path.join(r, ".opencode", "spec-memory", "config.json"))
  })
})

describe("constitutionPath", () => {
  it("joins root with .opencode/spec-memory/constitution.md", () => {
    const r = path.resolve("/root")
    expect(constitutionPath(r)).toBe(path.join(r, ".opencode", "spec-memory", "constitution.md"))
  })
})

describe("specJsonPath", () => {
  it("joins featureDir with spec.json", () => {
    const fd = path.resolve("/proj/specs/001-foo")
    expect(specJsonPath(fd)).toBe(path.join(fd, "spec.json"))
  })
})

describe("specsDirPath", () => {
  it("joins root with specs", () => {
    const r = path.resolve("/root")
    expect(specsDirPath(r)).toBe(path.join(r, "specs"))
  })
})

describe("steeringDirPath", () => {
  it("joins root with .opencode/steering", () => {
    const r = path.resolve("/root")
    expect(steeringDirPath(r)).toBe(path.join(r, ".opencode", "steering"))
  })
})

describe("productSteeringPath", () => {
  it("joins root with .opencode/steering/product.md", () => {
    const r = path.resolve("/root")
    expect(productSteeringPath(r)).toBe(path.join(r, ".opencode", "steering", "product.md"))
  })
})

describe("techSteeringPath", () => {
  it("joins root with .opencode/steering/tech.md", () => {
    const r = path.resolve("/root")
    expect(techSteeringPath(r)).toBe(path.join(r, ".opencode", "steering", "tech.md"))
  })
})

describe("structureSteeringPath", () => {
  it("joins root with .opencode/steering/structure.md", () => {
    const r = path.resolve("/root")
    expect(structureSteeringPath(r)).toBe(path.join(r, ".opencode", "steering", "structure.md"))
  })
})

// ── DEFAULT_SESSION ────────────────────────────────────────

describe("DEFAULT_SESSION", () => {
  it("has the expected shape with null defaults and init phase", () => {
    expect(DEFAULT_SESSION.command).toBeNull()
    expect(DEFAULT_SESSION.phase).toBe("init")
    expect(DEFAULT_SESSION.featureDir).toBeNull()
    expect(DEFAULT_SESSION.featureNumber).toBeNull()
    expect(DEFAULT_SESSION.featureName).toBeNull()
    expect(DEFAULT_SESSION.nextStep).toBe("/spec <description>")
    expect(DEFAULT_SESSION.lastResult).toBeNull()
    expect(DEFAULT_SESSION.history).toEqual([])
  })
})

// ── DEFAULT_CONFIG ─────────────────────────────────────────

describe("DEFAULT_CONFIG", () => {
  it("has the expected shape with null defaults and empty preferences", () => {
    expect(DEFAULT_CONFIG.defaultTechStack).toBeNull()
    expect(DEFAULT_CONFIG.lastUsedLanguage).toBeNull()
    expect(DEFAULT_CONFIG.preferences).toEqual({})
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

describe("SpecJsonSchema rejection", () => {
  const valid = { feature_name: "test", feature_number: 1, created_at: "2024-01-01", updated_at: "2024-01-01", phase: "spec", approvals: { spec: { generated: false, approved: false }, plan: { generated: false, approved: false }, tasks: { generated: false, approved: false } }, ready_for_implementation: false }

  it("accepts a valid object", () => {
    const r = SpecJsonSchema.safeParse(valid)
    expect(r.success).toBe(true)
  })

  it("rejects when feature_name has wrong type", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, feature_name: 123 })
    expect(r.success).toBe(false)
  })

  it("rejects when feature_number has wrong type", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, feature_number: "abc" })
    expect(r.success).toBe(false)
  })

  it("rejects when phase is invalid", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, phase: "invalid-phase" })
    expect(r.success).toBe(false)
  })

  it("rejects when phase is empty string", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, phase: "" })
    expect(r.success).toBe(false)
  })

  it("rejects when ready_for_implementation has wrong type", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, ready_for_implementation: "yes" })
    expect(r.success).toBe(false)
  })

  it("rejects when created_at is missing", () => {
    const { created_at, ...noCreated } = valid
    const r = SpecJsonSchema.safeParse(noCreated)
    expect(r.success).toBe(false)
  })

  it("rejects when approvals is missing", () => {
    const { approvals, ...noApprovals } = valid
    const r = SpecJsonSchema.safeParse(noApprovals)
    expect(r.success).toBe(false)
  })

  it("rejects when approvals.spec has wrong type", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, approvals: { spec: "invalid", plan: { generated: false, approved: false }, tasks: { generated: false, approved: false } } })
    expect(r.success).toBe(false)
  })

  it("rejects when approvals.spec.generated has wrong type", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, approvals: { spec: { generated: "yes", approved: false }, plan: { generated: false, approved: false }, tasks: { generated: false, approved: false } } })
    expect(r.success).toBe(false)
  })

  it("accepts object with extra unknown fields (zod strips by default)", () => {
    const r = SpecJsonSchema.safeParse({ ...valid, extra_field: "surprise" })
    expect(r.success).toBe(true)
  })
})
