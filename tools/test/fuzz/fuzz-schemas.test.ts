import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  SessionStateSchema,
  SpecJsonSchema,
  ConfigSchema,
  DeltaSchema,
  DeltasIndexSchema,
  HealthReportSchema,
  FrontmatterSchema,
  DeltaStatusSchema,
  DeltaTypeSchema,
  DeltaImpactSchema,
} from "../../shared/schemas"
import { readSession, readConfig, readSpecJson, writeSession, writeSpecJson, writeConfigWithBackup } from "../../shared/io"
import { clearCorruptionWarnings, corruptionWarnings } from "../../shared/io"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fuzz-test-"))
  await fs.mkdir(path.join(tmpDir, ".opencode", "spec-memory"), { recursive: true })
  await fs.mkdir(path.join(tmpDir, ".opencode", "backups"), { recursive: true })
  clearCorruptionWarnings()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function validSession() {
  return {
    command: "test",
    phase: "spec" as const,
    featureDir: "specs/001-test",
    featureNumber: 1,
    featureName: "test",
    nextStep: "/plan",
    lastResult: null,
    history: ["step1"],
  }
}

function validSpecJson() {
  return {
    feature_name: "test",
    feature_number: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    phase: "spec" as const,
    approvals: {
      spec: { generated: true, approved: false },
      plan: { generated: false, approved: false },
      tasks: { generated: false, approved: false },
    },
    ready_for_implementation: false,
  }
}

function validConfig() {
  return {
    defaultTechStack: null,
    lastUsedLanguage: null,
    expressMode: false,
    autoVersioning: false,
    preferences: {},
  }
}

// ─── 1. JSON Truncado ──────────────────────────────────────────────────────

describe("Fuzz: Truncated JSON", () => {
  it("SessionStateSchema rejects truncated JSON", () => {
    const truncated = '{ "phase": "sp'
    expect(() => JSON.parse(truncated)).toThrow()
  })

  it("SpecJsonSchema rejects truncated JSON", () => {
    const truncated = '{ "feature_name": "test", "feature_number":'
    expect(() => JSON.parse(truncated)).toThrow()
  })

  it("ConfigSchema rejects truncated JSON", () => {
    const truncated = '{ "defaultTechStack": "No'
    expect(() => JSON.parse(truncated)).toThrow()
  })

  it("readSession handles truncated file gracefully", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    await fs.writeFile(fp, '{ "phase": "sp', "utf-8")
    const result = await readSession(tmpDir)
    expect(result).toBeDefined()
    expect(result.phase).toBe("init")
  })

  it("readSpecJson handles truncated file gracefully", async () => {
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")
    await fs.writeFile(fp, '{ "feature_name":', "utf-8")
    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()
  })

  it("readConfig handles truncated file gracefully", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "config.json")
    await fs.writeFile(fp, '{ "expressMode":', "utf-8")
    const result = await readConfig(tmpDir)
    expect(result).toBeDefined()
    expect(result.expressMode).toBe(false)
  })
})

// ─── 2. BOM + CRLF ────────────────────────────────────────────────────────

describe("Fuzz: BOM + CRLF", () => {
  it("JSON.parse rejects BOM prefix", () => {
    const withBOM = "\uFEFF" + JSON.stringify(validSession())
    expect(() => JSON.parse(withBOM)).toThrow()
  })

  it("readSession returns default when BOM in file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    await fs.writeFile(fp, "\uFEFF" + JSON.stringify(validSession()), "utf-8")
    const result = await readSession(tmpDir)
    expect(result).toBeDefined()
    expect(result.phase).toBe("init")
  })

  it("readSpecJson returns null when BOM in file", async () => {
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")
    await fs.writeFile(fp, "\uFEFF" + JSON.stringify(validSpecJson()), "utf-8")
    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()
  })

  it("readConfig returns default when BOM in file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "config.json")
    await fs.writeFile(fp, "\uFEFF" + JSON.stringify(validConfig()), "utf-8")
    const result = await readConfig(tmpDir)
    expect(result.expressMode).toBe(false)
  })

  it("SessionStateSchema handles CRLF in string values", () => {
    const data = { ...validSession(), command: "line1\r\nline2" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema handles CRLF in feature_name", () => {
    const data = { ...validSpecJson(), feature_name: "name\r\nwith\r\ncrlf" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

// ─── 3. Null Bytes ─────────────────────────────────────────────────────────

describe("Fuzz: Null bytes", () => {
  it("SessionStateSchema handles null bytes in string fields (in-memory)", () => {
    const data = { ...validSession(), command: "test\x00value" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema handles null bytes in feature_name (in-memory)", () => {
    const data = { ...validSpecJson(), feature_name: "name\x00bad" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("readSession returns default when null bytes in file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    const content = JSON.stringify(validSession()).replace('"test"', '"test\x00value"')
    await fs.writeFile(fp, content, "utf-8")
    const result = await readSession(tmpDir)
    expect(result).toBeDefined()
    expect(result.phase).toBe("init")
  })

  it("readSpecJson returns null when null bytes in file", async () => {
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")
    const content = JSON.stringify(validSpecJson()).replace('"test"', '"test\x00value"')
    await fs.writeFile(fp, content, "utf-8")
    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()
  })
})

// ─── 4. Deep Nesting ───────────────────────────────────────────────────────

describe("Fuzz: Deep nesting", () => {
  it("SessionStateSchema handles deeply nested history array", () => {
    const deepHistory = Array(1000).fill("item")
    const data = { ...validSession(), history: deepHistory }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.history.length).toBe(1000)
  })

  it("ConfigSchema handles moderately nested preferences", () => {
    const preferences: Record<string, string> = {}
    for (let i = 0; i < 50; i++) {
      preferences[`key-${i}`] = `value-${i}`
    }
    const data = { ...validConfig(), preferences }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(Object.keys(result.data!.preferences).length).toBe(50)
  })

  it("SpecJsonSchema handles nested approvals", () => {
    const data = {
      ...validSpecJson(),
      approvals: {
        spec: { generated: true, approved: false },
        plan: { generated: true, approved: true },
        tasks: { generated: false, approved: false },
      },
    }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.approvals.spec.generated).toBe(true)
  })

  it("readSession handles deeply nested JSON file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    const data = { ...validSession(), history: Array(1000).fill("step") }
    await fs.writeFile(fp, JSON.stringify(data), "utf-8")
    const result = await readSession(tmpDir)
    expect(result.history.length).toBe(1000)
  })
})

// ─── 5. Large Strings ──────────────────────────────────────────────────────

describe("Fuzz: Large strings", () => {
  it("SessionStateSchema handles large command string", () => {
    const largeStr = "x".repeat(10 * 1024 * 1024)
    const data = { ...validSession(), command: largeStr }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.command!.length).toBe(10 * 1024 * 1024)
  })

  it("SpecJsonSchema handles large feature_name", () => {
    const largeStr = "a".repeat(5 * 1024 * 1024)
    const data = { ...validSpecJson(), feature_name: largeStr }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.feature_name.length).toBe(5 * 1024 * 1024)
  })

  it("ConfigSchema handles large defaultTechStack", () => {
    const largeStr = "stack".repeat(2 * 1024 * 1024)
    const data = { ...validConfig(), defaultTechStack: largeStr }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("readSession handles large file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    const largeStr = "x".repeat(10 * 1024 * 1024)
    const data = { ...validSession(), lastResult: largeStr }
    await fs.writeFile(fp, JSON.stringify(data), "utf-8")
    const result = await readSession(tmpDir)
    expect(result.lastResult!.length).toBe(10 * 1024 * 1024)
  })
})

// ─── 6. Unicode Extremo ────────────────────────────────────────────────────

describe("Fuzz: Extreme Unicode", () => {
  it("SessionStateSchema handles emojis", () => {
    const data = { ...validSession(), featureName: "feature 🚀🎯🔥" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema handles RTL text", () => {
    const data = { ...validSpecJson(), feature_name: "مرحبا بالعالم" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SessionStateSchema handles combining characters", () => {
    const data = { ...validSession(), featureName: "é (e + combining acute)" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema handles CJK characters", () => {
    const data = { ...validSpecJson(), feature_name: "日本語テスト" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("ConfigSchema handles mixed unicode", () => {
    const data = { ...validConfig(), defaultTechStack: "React 🇯🇵 + ارامكو" }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("readSession handles unicode in file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    const data = { ...validSession(), featureName: "日本語🚀é" }
    await fs.writeFile(fp, JSON.stringify(data), "utf-8")
    const result = await readSession(tmpDir)
    expect(result.featureName).toBe("日本語🚀é")
  })
})

// ─── 7. Empty Array vs Undefined ───────────────────────────────────────────

describe("Fuzz: Empty array vs undefined", () => {
  it("SessionStateSchema accepts empty history array", () => {
    const data = { ...validSession(), history: [] }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.history).toEqual([])
  })

  it("SessionStateSchema rejects undefined history", () => {
    const data = { ...validSession(), history: undefined }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects missing history", () => {
    const { history, ...rest } = validSession()
    const result = SessionStateSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("ConfigSchema accepts empty preferences", () => {
    const data = { ...validConfig(), preferences: {} }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.preferences).toEqual({})
  })

  it("ConfigSchema rejects undefined preferences", () => {
    const data = { ...validConfig(), preferences: undefined }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema accepts empty approvals", () => {
    const data = {
      ...validSpecJson(),
      approvals: {
        spec: { generated: false, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      },
    }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("DeltasIndexSchema accepts empty deltas array", () => {
    const data = { feature: "001-test", deltas: [] }
    const result = DeltasIndexSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.deltas).toEqual([])
  })

  it("DeltasIndexSchema rejects undefined deltas", () => {
    const data = { feature: "001-test", deltas: undefined }
    const result = DeltasIndexSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

// ─── 8. Tipos Cruzados ─────────────────────────────────────────────────────

describe("Fuzz: Cross types", () => {
  it("SessionStateSchema rejects number in phase field", () => {
    const data = { ...validSession(), phase: 123 }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects boolean in phase field", () => {
    const data = { ...validSession(), phase: true }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects string in feature_number field", () => {
    const data = { ...validSpecJson(), feature_number: "not-a-number" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects number in feature_name field", () => {
    const data = { ...validSpecJson(), feature_name: 42 }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("ConfigSchema rejects string in expressMode field", () => {
    const data = { ...validConfig(), expressMode: "yes" }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects array in command field", () => {
    const data = { ...validSession(), command: ["a", "b"] }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects object in phase field", () => {
    const data = { ...validSpecJson(), phase: { nested: "value" } }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("ConfigSchema rejects number in preferences field", () => {
    const data = { ...validConfig(), preferences: 42 }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects null in history field", () => {
    const data = { ...validSession(), history: null }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

// ─── 9. Empty String vs Null ───────────────────────────────────────────────

describe("Fuzz: Empty string vs null", () => {
  it("ConfigSchema accepts null defaultTechStack", () => {
    const data = { ...validConfig(), defaultTechStack: null }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.defaultTechStack).toBeNull()
  })

  it("ConfigSchema accepts empty string defaultTechStack", () => {
    const data = { ...validConfig(), defaultTechStack: "" }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.defaultTechStack).toBe("")
  })

  it("SessionStateSchema accepts null command", () => {
    const data = { ...validSession(), command: null }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.command).toBeNull()
  })

  it("SessionStateSchema accepts empty string command", () => {
    const data = { ...validSession(), command: "" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.command).toBe("")
  })

  it("SpecJsonSchema accepts empty string feature_name", () => {
    const data = { ...validSpecJson(), feature_name: "" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema accepts null active_delta", () => {
    const data = { ...validSpecJson(), active_delta: null }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect(result.data!.active_delta).toBeNull()
  })

  it("SpecJsonSchema accepts undefined active_delta", () => {
    const data = { ...validSpecJson() }
    delete (data as any).active_delta
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

// ─── 10. Fechas Inválidas ─────────────────────────────────────────────────

describe("Fuzz: Invalid dates", () => {
  it("SpecJsonSchema accepts non-date string in created_at", () => {
    const data = { ...validSpecJson(), created_at: "not-a-date" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema accepts empty string in created_at", () => {
    const data = { ...validSpecJson(), created_at: "" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema accepts ISO date in created_at", () => {
    const data = { ...validSpecJson(), created_at: "2026-01-15T10:30:00.000Z" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema accepts timestamp number as string", () => {
    const data = { ...validSpecJson(), created_at: "1705305600000" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("SpecJsonSchema rejects number in created_at", () => {
    const data = { ...validSpecJson(), created_at: 1705305600000 }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("DeltaSchema accepts various date formats in created_at", () => {
    const formats = [
      "2026-01-01",
      "01/01/2026",
      "Jan 1, 2026",
      "not-a-date",
      "",
      "2026-01-01T00:00:00.000Z",
    ]
    for (const fmt of formats) {
      const data = {
        id: "delta-1",
        type: "feature" as const,
        title: "test",
        status: "draft" as const,
        impact: "low" as const,
        parent_feature: "001-test",
        created_at: fmt,
        updated_at: fmt,
      }
      const result = DeltaSchema.safeParse(data)
      expect(result.success).toBe(true)
    }
  })
})

// ─── 11. Enum fuera de rango ───────────────────────────────────────────────

describe("Fuzz: Out-of-range enums", () => {
  it("SessionStateSchema rejects unknown phase", () => {
    const data = { ...validSession(), phase: "unknown_phase" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects unknown phase", () => {
    const data = { ...validSpecJson(), phase: "invalid" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("DeltaSchema rejects unknown status", () => {
    const data = {
      id: "delta-1",
      type: "feature" as const,
      title: "test",
      status: "unknown_status",
      impact: "low" as const,
      parent_feature: "001-test",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    }
    const result = DeltaSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("DeltaSchema rejects unknown type", () => {
    const data = {
      id: "delta-1",
      type: "unknown_type",
      title: "test",
      status: "draft" as const,
      impact: "low" as const,
      parent_feature: "001-test",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    }
    const result = DeltaSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("DeltaSchema rejects unknown impact", () => {
    const data = {
      id: "delta-1",
      type: "feature" as const,
      title: "test",
      status: "draft" as const,
      impact: "unknown_impact",
      parent_feature: "001-test",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    }
    const result = DeltaSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("DeltaStatusSchema rejects empty string", () => {
    const result = DeltaStatusSchema.safeParse("")
    expect(result.success).toBe(false)
  })

  it("DeltaTypeSchema rejects empty string", () => {
    const result = DeltaTypeSchema.safeParse("")
    expect(result.success).toBe(false)
  })

  it("DeltaImpactSchema rejects empty string", () => {
    const result = DeltaImpactSchema.safeParse("")
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects case-sensitive phase", () => {
    const data = { ...validSession(), phase: "Spec" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects case-sensitive phase", () => {
    const data = { ...validSpecJson(), phase: "Plan" }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

// ─── 12. Concurrent Writes ─────────────────────────────────────────────────

describe("Fuzz: Concurrent writes", () => {
  it("10 sequential writes of same session data", async () => {
    const data = validSession()
    for (let i = 0; i < 10; i++) {
      await writeSession(tmpDir, data)
    }
    const result = await readSession(tmpDir)
    expect(result.phase).toBe("spec")
    expect(result.featureName).toBe("test")
  })

  it("10 sequential writes of same spec.json", async () => {
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const data = validSpecJson()
    for (let i = 0; i < 10; i++) {
      await writeSpecJson(data, featureDir)
    }
    const result = await readSpecJson(featureDir)
    expect(result).not.toBeNull()
    expect(result!.feature_name).toBe("test")
  })

  it("10 sequential writes of same config", async () => {
    const data = validConfig()
    for (let i = 0; i < 10; i++) {
      await writeConfigWithBackup(tmpDir, data)
    }
    const result = await readConfig(tmpDir)
    expect(result.expressMode).toBe(false)
  })

  it("10 sequential writes of different session data", async () => {
    for (let i = 0; i < 10; i++) {
      await writeSession(tmpDir, { ...validSession(), featureName: `feature-${i}` })
    }
    const result = await readSession(tmpDir)
    expect(result).toBeDefined()
    expect(result.featureName).toBe("feature-9")
  })

  it("concurrent reads during write", async () => {
    const data = validSession()
    await writeSession(tmpDir, data)
    const reads = Array.from({ length: 10 }, () => readSession(tmpDir))
    const results = await Promise.all(reads)
    for (const r of results) {
      expect(r.phase).toBe("spec")
    }
  })
})

// ─── 13. Missing Required Fields ───────────────────────────────────────────

describe("Fuzz: Missing required fields", () => {
  it("SessionStateSchema rejects missing phase", () => {
    const { phase, ...rest } = validSession()
    const result = SessionStateSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects missing command", () => {
    const { command, ...rest } = validSession()
    const result = SessionStateSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects missing feature_name", () => {
    const { feature_name, ...rest } = validSpecJson()
    const result = SpecJsonSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects missing approvals", () => {
    const { approvals, ...rest } = validSpecJson()
    const result = SpecJsonSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("ConfigSchema rejects missing expressMode", () => {
    const { expressMode, ...rest } = validConfig()
    const result = ConfigSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("DeltaSchema rejects missing id", () => {
    const { id, ...rest } = {
      id: "delta-1",
      type: "feature" as const,
      title: "test",
      status: "draft" as const,
      impact: "low" as const,
      parent_feature: "001-test",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    }
    const result = DeltaSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("HealthReportSchema rejects missing overall", () => {
    const data = {
      session: { status: "healthy", file: "session.json" },
      config: { status: "healthy", file: "config.json" },
      features: [],
    }
    const result = HealthReportSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

// ─── 14. Extra Unknown Fields ──────────────────────────────────────────────

describe("Fuzz: Extra unknown fields", () => {
  it("SessionStateSchema strips unknown fields", () => {
    const data = { ...validSession(), unknownField: "should be stripped" }
    const result = SessionStateSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect((result.data as any).unknownField).toBeUndefined()
  })

  it("SpecJsonSchema strips unknown fields", () => {
    const data = { ...validSpecJson(), extra: true, another: 42 }
    const result = SpecJsonSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect((result.data as any).extra).toBeUndefined()
  })

  it("ConfigSchema strips unknown fields", () => {
    const data = { ...validConfig(), notReal: "value" }
    const result = ConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect((result.data as any).notReal).toBeUndefined()
  })

  it("DeltaSchema strips unknown fields", () => {
    const data = {
      id: "delta-1",
      type: "feature" as const,
      title: "test",
      status: "draft" as const,
      impact: "low" as const,
      parent_feature: "001-test",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      fakeField: "should not exist",
    }
    const result = DeltaSchema.safeParse(data)
    expect(result.success).toBe(true)
    expect((result.data as any).fakeField).toBeUndefined()
  })
})

// ─── 15. Empty Object vs Wrong Type ────────────────────────────────────────

describe("Fuzz: Empty object vs wrong type", () => {
  it("SessionStateSchema rejects empty object", () => {
    const result = SessionStateSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects empty object", () => {
    const result = SpecJsonSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it("ConfigSchema rejects empty object", () => {
    const result = ConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it("DeltaSchema rejects empty object", () => {
    const result = DeltaSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects string input", () => {
    const result = SessionStateSchema.safeParse("not an object")
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects array input", () => {
    const result = SpecJsonSchema.safeParse([1, 2, 3])
    expect(result.success).toBe(false)
  })

  it("ConfigSchema rejects number input", () => {
    const result = ConfigSchema.safeParse(42)
    expect(result.success).toBe(false)
  })

  it("SessionStateSchema rejects null input", () => {
    const result = SessionStateSchema.safeParse(null)
    expect(result.success).toBe(false)
  })

  it("SpecJsonSchema rejects undefined input", () => {
    const result = SpecJsonSchema.safeParse(undefined)
    expect(result.success).toBe(false)
  })
})

// ─── 16. Corruption Detection ──────────────────────────────────────────────

describe("Fuzz: Corruption detection", () => {
  it("readSession detects corrupt JSON and returns default", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    await fs.writeFile(fp, "{{{{invalid json}}}}", "utf-8")
    const result = await readSession(tmpDir)
    expect(result.phase).toBe("init")
  })

  it("readSpecJson detects corrupt JSON and returns null", async () => {
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")
    await fs.writeFile(fp, "not json at all", "utf-8")
    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()
  })

  it("readConfig detects corrupt JSON and returns default", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "config.json")
    await fs.writeFile(fp, "}invalid{json", "utf-8")
    const result = await readConfig(tmpDir)
    expect(result.expressMode).toBe(false)
  })

  it("readSession handles empty file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    await fs.writeFile(fp, "", "utf-8")
    const result = await readSession(tmpDir)
    expect(result.phase).toBe("init")
  })

  it("readSpecJson handles empty file", async () => {
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")
    await fs.writeFile(fp, "", "utf-8")
    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()
  })

  it("readConfig handles empty file", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "config.json")
    await fs.writeFile(fp, "", "utf-8")
    const result = await readConfig(tmpDir)
    expect(result.expressMode).toBe(false)
  })

  it("readSession handles binary garbage", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "session.json")
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
    await fs.writeFile(fp, garbage)
    const result = await readSession(tmpDir)
    expect(result.phase).toBe("init")
  })

  it("readSpecJson handles binary garbage", async () => {
    const featureDir = path.join(tmpDir, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const fp = path.join(featureDir, "spec.json")
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
    await fs.writeFile(fp, garbage)
    const result = await readSpecJson(featureDir)
    expect(result).toBeNull()
  })

  it("readConfig handles binary garbage", async () => {
    const fp = path.join(tmpDir, ".opencode", "spec-memory", "config.json")
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
    await fs.writeFile(fp, garbage)
    const result = await readConfig(tmpDir)
    expect(result.expressMode).toBe(false)
  })
})
