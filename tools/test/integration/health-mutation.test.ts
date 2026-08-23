import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import healthTool from "../../speckit-health"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import {
  writeSession,
  readSession,
  writeConfigWithBackup,
  readConfig,
  writeSpecJson,
  readSpecJson,
  writeWithBackup,
  writeFileChecksum,
  corruptionWarnings,
  clearCorruptionWarnings,
} from "../../shared/io"
import {
  sessionPath,
  configPath,
  specsDirPath,
  specJsonPath,
} from "../../shared/schemas"
import { SessionStateSchema, SpecJsonSchema, type SessionState, type SpecJson } from "../../shared/schemas"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
  await createConstitution(worktree)
  await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
  clearCorruptionWarnings()
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

async function getFeatureDir(): Promise<string> {
  const dirs = await fs.readdir(specsDirPath(worktree))
  return path.join(specsDirPath(worktree), dirs[0])
}

function makeValidSession(overrides?: Partial<SessionState>): SessionState {
  return {
    command: "spec",
    phase: "spec",
    featureDir: "001-test",
    featureNumber: 1,
    featureName: "Test",
    nextStep: "plan",
    lastResult: "created",
    history: ["step1"],
    ...overrides,
  }
}

function makeValidSpec(overrides?: Partial<SpecJson>): SpecJson {
  return {
    feature_name: "Test Feature",
    feature_number: 1,
    title: "Test Feature",
    status: "approved",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phase: "spec",
    approvals: {
      spec: { generated: true, approved: false },
      plan: { generated: false, approved: false },
      tasks: { generated: false, approved: false },
    },
    spec_generated: true,
    plan_generated: false,
    tasks_generated: false,
    ready_for_implementation: false,
    active_delta: null,
    ...overrides,
  }
}

describe("Phase 2: Health Module - Mutation Score Improvement", () => {

  describe("2.1 Auto-fix logic - session.json", () => {
    it("fixes corrupted session.json", async () => {
      const sessionFp = sessionPath(worktree)
      await writeSession(worktree, makeValidSession({ phase: "spec", featureName: "Original" }))
      await writeSession(worktree, makeValidSession({ phase: "plan", featureName: "Auth" }))
      await writeFileChecksum(sessionFp)
      await fs.writeFile(sessionFp, "NOT JSON", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.session.status).toBe("restored")
      const restored = await readSession(worktree)
      expect(restored.phase).toBe("spec")
      expect(restored.featureName).toBe("Original")
    })

    it("fixes missing session.json when backup exists", async () => {
      const sessionFp = sessionPath(worktree)
      await writeSession(worktree, makeValidSession({ phase: "spec" }))
      await writeSession(worktree, makeValidSession({ phase: "tasks" }))
      await writeFileChecksum(sessionFp)
      await fs.unlink(sessionFp)

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.session.status).toBe("restored")
      const restored = await readSession(worktree)
      expect(restored.phase).toBe("spec")
    })

    it("does not fix session when no backup exists", async () => {
      const sessionFp = sessionPath(worktree)
      await fs.mkdir(path.dirname(sessionFp), { recursive: true })
      await fs.writeFile(sessionFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.session.status).toBe("corrupted")
    })
  })

  describe("2.2 Auto-fix logic - config.json", () => {
    it("fixes corrupted config.json", async () => {
      const configFp = configPath(worktree)
      const validConfig = {
        defaultTechStack: "React",
        lastUsedLanguage: "ts",
        expressMode: true,
        autoVersioning: false,
        preferences: {} as Record<string, string>,
      }
      await writeWithBackup(configFp, JSON.stringify(validConfig, null, 2), worktree)
      await writeFileChecksum(configFp)
      await writeWithBackup(configFp, JSON.stringify({ ...validConfig, defaultTechStack: "Vue" }, null, 2), worktree)
      await writeFileChecksum(configFp)
      await fs.writeFile(configFp, "NOT JSON", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.config.status).toBe("restored")
      const restored = await readConfig(worktree)
      expect(restored.defaultTechStack).toBe("React")
    })

    it("fixes missing config.json when backup exists", async () => {
      const configFp = configPath(worktree)
      const validConfig = {
        defaultTechStack: "Vue",
        lastUsedLanguage: "js",
        expressMode: false,
        autoVersioning: true,
        preferences: {} as Record<string, string>,
      }
      await writeWithBackup(configFp, JSON.stringify(validConfig, null, 2), worktree)
      await writeFileChecksum(configFp)
      await writeWithBackup(configFp, JSON.stringify({ ...validConfig, defaultTechStack: "Angular" }, null, 2), worktree)
      await writeFileChecksum(configFp)
      await fs.unlink(configFp)

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.config.status).toBe("restored")
      const restored = await readConfig(worktree)
      expect(restored.defaultTechStack).toBe("Vue")
    })

    it("does not fix config when no backup exists", async () => {
      const configFp = configPath(worktree)
      await fs.mkdir(path.dirname(configFp), { recursive: true })
      await fs.writeFile(configFp, '{"valid":"json"}', "utf-8")
      await writeFileChecksum(configFp)
      await fs.writeFile(configFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.config.status).toBe("corrupted")
    })
  })

  describe("2.3 Auto-fix logic - spec.json", () => {
    it("fixes corrupted spec.json", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      await writeSpecJson(makeValidSpec({ feature_name: "Original" }), featureDir)
      await writeFileChecksum(sjFp)
      await writeSpecJson(makeValidSpec({ feature_name: "Updated" }), featureDir)
      await writeFileChecksum(sjFp)
      await fs.writeFile(sjFp, "BROKEN", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.features[0].spec_json).toBe("restored")
      const restored = await readSpecJson(featureDir)
      expect(restored?.feature_name).toBe("Original")
    })

    it("fixes missing spec.json when backup exists", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      await writeSpecJson(makeValidSpec({ feature_name: "Original" }), featureDir)
      await writeFileChecksum(sjFp)
      await writeSpecJson(makeValidSpec({ feature_name: "Custom Name" }), featureDir)
      await writeFileChecksum(sjFp)
      await fs.unlink(sjFp)

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.features[0].spec_json).toBe("restored")
      const restored = await readSpecJson(featureDir)
      expect(restored?.feature_name).toBe("Original")
    })

    it("does not fix spec.json when no backup exists", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.features[0].spec_json).toBe("corrupted")
    })
  })

  describe("2.4 Multiple corruptions in single run", () => {
    it("fixes all corrupted files at once", async () => {
      const sessionFp = sessionPath(worktree)
      const configFp = configPath(worktree)
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)

      await writeSession(worktree, makeValidSession({ phase: "spec" }))
      await writeSession(worktree, makeValidSession({ phase: "impl" }))
      await writeFileChecksum(sessionFp)

      const validConfig = {
        defaultTechStack: "Angular",
        lastUsedLanguage: "ts",
        expressMode: false,
        autoVersioning: false,
        preferences: {} as Record<string, string>,
      }
      await writeWithBackup(configFp, JSON.stringify(validConfig, null, 2), worktree)
      await writeFileChecksum(configFp)
      await writeWithBackup(configFp, JSON.stringify({ ...validConfig, defaultTechStack: "React" }, null, 2), worktree)
      await writeFileChecksum(configFp)

      await writeSpecJson(makeValidSpec({ feature_name: "Original" }), featureDir)
      await writeFileChecksum(sjFp)
      await writeSpecJson(makeValidSpec({ feature_name: "Updated" }), featureDir)
      await writeFileChecksum(sjFp)

      await fs.writeFile(sessionFp, "CORRUPT1", "utf-8")
      await fs.writeFile(configFp, "CORRUPT2", "utf-8")
      await fs.writeFile(sjFp, "CORRUPT3", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.session.status).toBe("restored")
      expect(result.metadata.config.status).toBe("restored")
      expect(result.metadata.features[0].spec_json).toBe("restored")
    })

    it("reports degraded when some fixes fail", async () => {
      const sessionFp = sessionPath(worktree)
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)

      await writeSession(worktree, makeValidSession({ phase: "spec" }))
      await writeSession(worktree, makeValidSession({ phase: "plan" }))
      await writeFileChecksum(sessionFp)

      await writeSpecJson(makeValidSpec({ feature_name: "Original" }), featureDir)
      await writeFileChecksum(sjFp)

      await fs.writeFile(sessionFp, "CORRUPT", "utf-8")

      const backupDir = path.join(worktree, ".opencode", "backups")
      const bakFiles = await fs.readdir(backupDir).catch(() => [])
      for (const f of bakFiles) {
        if (f.startsWith("spec.json")) {
          await fs.rm(path.join(backupDir, f), { force: true })
        }
      }

      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.session.status).toBe("restored")
      expect(result.metadata.features[0].spec_json).toBe("corrupted")
      expect(result.metadata.overall).toBe("degraded")
    })
  })

  describe("2.5 Backup integrity verification", () => {
    it("reports corrupted backup sidecar", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      const backupDir = path.join(worktree, ".opencode", "backups")

      await fs.rm(backupDir, { recursive: true, force: true })
      await fs.mkdir(backupDir, { recursive: true })
      await fs.writeFile(path.join(backupDir, "spec.json.2026.bak"), "CORRUPTED", "utf-8")

      await writeSpecJson(makeValidSpec(), featureDir)
      await writeFileChecksum(sjFp)
      await fs.writeFile(sjFp, "NEW CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.output).toContain("CRITICAL")
      expect(result.metadata.features[0].spec_json).toBe("corrupted")
    })

    it("reports backup with mismatched checksum", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      const backupDir = path.join(worktree, ".opencode", "backups")

      await fs.rm(backupDir, { recursive: true, force: true })
      await fs.mkdir(backupDir, { recursive: true })
      await fs.writeFile(path.join(backupDir, "spec.json.2026.bak"), "{}", "utf-8")
      await fs.writeFile(path.join(backupDir, "spec.json.2026.bak.sha256"), "wronghash", "utf-8")

      await writeSpecJson(makeValidSpec(), featureDir)
      await writeFileChecksum(sjFp)
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.features[0].spec_json).toBe("corrupted")
    })
  })

  describe("2.6 Corruption detection", () => {
    it("detects feature-level corruption", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.features[0].spec_json).toBe("corrupted")
      expect(result.output).toContain("corrupted")
    })

    it("detects session corruption", async () => {
      const sessionFp = sessionPath(worktree)
      await fs.mkdir(path.dirname(sessionFp), { recursive: true })
      await fs.writeFile(sessionFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.session.status).toBe("corrupted")
    })

    it("detects config corruption", async () => {
      const configFp = configPath(worktree)
      await fs.mkdir(path.dirname(configFp), { recursive: true })
      await fs.writeFile(configFp, '{"valid":"json"}', "utf-8")
      await writeFileChecksum(configFp)
      await fs.writeFile(configFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.config.status).toBe("corrupted")
    })

    it("detects multiple corrupted features", async () => {
      await scaffoldTool.execute({ featureName: "Second Feature", template: "spec" }, ctx)
      const dirs = await fs.readdir(specsDirPath(worktree))

      for (const dir of dirs) {
        const sjFp = specJsonPath(path.join(specsDirPath(worktree), dir))
        await fs.writeFile(sjFp, "CORRUPT", "utf-8")
      }

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.features).toHaveLength(2)
      expect(result.metadata.features.every((f: any) => f.spec_json === "corrupted")).toBe(true)
    })
  })

  describe("2.7 Output formatting", () => {
    it("shows healthy features count", async () => {
      const result = await healthTool.execute({}, ctx)
      expect(result.output).toContain("Features: 1/1 healthy")
    })

    it("shows restored status in output", async () => {
      const sessionFp = sessionPath(worktree)
      await writeSession(worktree, makeValidSession({ phase: "spec" }))
      await writeSession(worktree, makeValidSession({ phase: "plan" }))
      await writeFileChecksum(sessionFp)
      await fs.writeFile(sessionFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.output).toContain("restored from backup")
    })

    it("shows corrupted status in output", async () => {
      const sessionFp = sessionPath(worktree)
      await fs.mkdir(path.dirname(sessionFp), { recursive: true })
      await fs.writeFile(sessionFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.output).toContain("session.json: corrupted")
    })

    it("shows backup info when available", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      const featureName = path.basename(featureDir)
      const backupDir = path.join(worktree, ".opencode", "backups")
      await fs.mkdir(backupDir, { recursive: true })
      await fs.writeFile(path.join(backupDir, `${featureName}-spec.json.2026.bak`), "{}", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.output).toContain("backups")
    })
  })

  describe("2.8 Overall status calculation", () => {
    it("reports healthy when all files OK", async () => {
      const configFp = configPath(worktree)
      await writeWithBackup(configFp, JSON.stringify({
        defaultTechStack: null,
        lastUsedLanguage: null,
        expressMode: false,
        autoVersioning: false,
        preferences: {},
      }, null, 2), worktree)
      await writeFileChecksum(configFp)

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.overall).toBe("healthy")
      expect(result.output).toContain("HEALTHY")
    })

    it("reports critical when corruption detected", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      const backupDir = path.join(worktree, ".opencode", "backups")
      await fs.rm(backupDir, { recursive: true, force: true })
      await fs.mkdir(backupDir, { recursive: true })
      await fs.writeFile(path.join(backupDir, "spec.json.2026.bak"), "CORRUPT", "utf-8")

      await writeSpecJson(makeValidSpec(), featureDir)
      await writeFileChecksum(sjFp)
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.overall).toBe("critical")
      expect(result.output).toContain("CRITICAL")
    })

    it("reports degraded after partial fix", async () => {
      const sessionFp = sessionPath(worktree)
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)

      await writeSession(worktree, makeValidSession({ phase: "spec" }))
      await writeSession(worktree, makeValidSession({ phase: "plan" }))
      await writeFileChecksum(sessionFp)
      await writeSpecJson(makeValidSpec({ feature_name: "Original" }), featureDir)
      await writeFileChecksum(sjFp)

      const backupDir = path.join(worktree, ".opencode", "backups")
      const bakFiles = await fs.readdir(backupDir).catch(() => [])
      for (const f of bakFiles) {
        if (f.startsWith("spec.json")) {
          await fs.rm(path.join(backupDir, f), { force: true })
        }
      }

      await fs.writeFile(sessionFp, "CORRUPT", "utf-8")
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.session.status).toBe("restored")
      expect(result.metadata.features[0].spec_json).toBe("corrupted")
      expect(result.metadata.overall).toBe("degraded")
    })
  })

  describe("2.9 Missing files detection", () => {
    it("reports missing session.json", async () => {
      const sessionFp = sessionPath(worktree)
      await fs.mkdir(path.dirname(sessionFp), { recursive: true })
      await fs.writeFile(sessionFp, '{"valid":"json"}', "utf-8")
      await writeFileChecksum(sessionFp)
      await fs.unlink(sessionFp)

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.session.status).toBe("missing")
    })

    it("reports missing config.json", async () => {
      const configFp = configPath(worktree)
      await fs.mkdir(path.dirname(configFp), { recursive: true })
      await fs.writeFile(configFp, '{"valid":"json"}', "utf-8")
      await writeFileChecksum(configFp)
      await fs.unlink(configFp)

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.config.status).toBe("missing")
    })

    it("reports missing spec.json for feature", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      await fs.unlink(sjFp)

      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.features[0].spec_json).toBe("missing")
    })
  })

  describe("2.10 Error handling", () => {
    it("returns error when no worktree", async () => {
      const result = await healthTool.execute({}, { worktree: undefined } as any)
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error when invalid project root", async () => {
      const result = await healthTool.execute({}, { worktree: "/nonexistent" } as any)
      expect(result.title).toBe("Error")
    })
  })

  describe("2.11 Corruption warnings", () => {
    it("clears warnings after health check", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      await writeSpecJson(makeValidSpec({ feature_name: "Original" }), featureDir)
      await writeFileChecksum(sjFp)
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      await healthTool.execute({}, ctx)
      expect(corruptionWarnings).toHaveLength(0)
    })

    it("includes corruption warnings in output", async () => {
      const featureDir = await getFeatureDir()
      const sjFp = specJsonPath(featureDir)
      await writeSpecJson(makeValidSpec({ feature_name: "Original" }), featureDir)
      await writeFileChecksum(sjFp)
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({}, ctx)
      const output = result.output as string
      const hasCorruption = output.includes("CORRUPTION") || output.includes("corrupted")
      expect(hasCorruption).toBe(true)
    })
  })

  describe("2.12 Multiple features", () => {
    it("reports health for multiple features", async () => {
      await scaffoldTool.execute({ featureName: "Feature Two", template: "spec" }, ctx)
      const result = await healthTool.execute({}, ctx)
      expect(result.metadata.features).toHaveLength(2)
      expect(result.output).toContain("Features: 2/2 healthy")
    })

    it("fixes only corrupted features", async () => {
      await scaffoldTool.execute({ featureName: "Feature Two", template: "spec" }, ctx)
      const dirs = await fs.readdir(specsDirPath(worktree))
      const firstFeatureDir = path.join(specsDirPath(worktree), dirs[0])
      const sjFp = specJsonPath(firstFeatureDir)

      await writeSpecJson(makeValidSpec(), firstFeatureDir)
      await writeFileChecksum(sjFp)
      await fs.writeFile(sjFp, "CORRUPT", "utf-8")

      const result = await healthTool.execute({ fix: true }, ctx)
      expect(result.metadata.features[0].spec_json).toBe("restored")
      expect(result.metadata.features[1].spec_json).toBe("healthy")
    })
  })
})
