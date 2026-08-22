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
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

async function getFeatureDir(): Promise<string> {
  const dirs = await fs.readdir(specsDirPath(worktree))
  return path.join(specsDirPath(worktree), dirs[0])
}

describe("1. Health check with healthy files", () => {
  it("reports all healthy", async () => {
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
    expect(result.title).toContain("HEALTHY")
    expect(result.output).toContain("session.json: healthy")
    expect(result.output).toContain("config.json: healthy")
    expect(result.output).toContain("Overall: HEALTHY")
    expect(result.metadata.overall).toBe("healthy")
  })
})

describe("2. Health check with corrupt session.json restores from backup", () => {
  it("restores session from backup", async () => {
    const sessionFp = sessionPath(worktree)
    const validSession: SessionState = {
      command: "spec",
      phase: "spec",
      featureDir: "001-test",
      featureNumber: 1,
      featureName: "Test Feature",
      nextStep: "plan",
      lastResult: "spec created",
      history: ["step1"],
    }
    await writeSession(worktree, validSession)
    await writeFileChecksum(sessionFp)
    await fs.writeFile(sessionFp, "CORRUPT JSON {{{", "utf-8")
    const result = await healthTool.execute({ fix: true }, ctx)
    expect(result.output).toContain("restored from backup")
    expect(result.metadata.session.status).toBe("restored")
    const restored = await readSession(worktree)
    expect(restored.phase).toBe("spec")
    expect(restored.featureName).toBe("Test Feature")
  })
})

describe("3. Health check with corrupt config.json restores from backup", () => {
  it("restores config from backup", async () => {
    const configFp = configPath(worktree)
    const validConfig = {
      defaultTechStack: "React+PostgreSQL",
      lastUsedLanguage: "typescript",
      expressMode: false,
      autoVersioning: false,
      preferences: {} as Record<string, string>,
    }
    await writeWithBackup(configFp, JSON.stringify(validConfig, null, 2), worktree)
    await writeFileChecksum(configFp)
    await writeWithBackup(configFp, JSON.stringify(validConfig, null, 2), worktree)
    await writeFileChecksum(configFp)
    await fs.writeFile(configFp, "NOT VALID JSON", "utf-8")
    const result = await healthTool.execute({ fix: true }, ctx)
    expect(result.output).toContain("restored from backup")
    expect(result.metadata.config.status).toBe("restored")
    const restored = await readConfig(worktree)
    expect(restored.defaultTechStack).toBe("React+PostgreSQL")
  })
})

describe("4. Health check with corrupt spec.json restores from backup", () => {
  it("restores spec.json from backup", async () => {
    const featureDir = await getFeatureDir()
    const sjFp = specJsonPath(featureDir)
    const validSpec: SpecJson = {
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
    }
    await writeSpecJson(validSpec, featureDir)
    await writeFileChecksum(sjFp)
    await fs.writeFile(sjFp, "BROKEN JSON", "utf-8")
    const result = await healthTool.execute({ fix: true }, ctx)
    expect(result.output).toContain("restored from backup")
    expect(result.metadata.features[0].spec_json).toBe("restored")
    const restored = await readSpecJson(featureDir)
    expect(restored?.feature_name).toBe("Test Feature")
  })
})

describe("5. Health check with corrupted backup reports it", () => {
  it("reports corrupted backup", async () => {
    const featureDir = await getFeatureDir()
    const sjFp = specJsonPath(featureDir)
    const validSpec: SpecJson = {
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
    }
    const backupDir = path.join(worktree, ".opencode", "backups")
    await fs.rm(backupDir, { recursive: true, force: true })
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(path.join(backupDir, "spec.json.2026.bak"), "CORRUPTED", "utf-8")
    await writeSpecJson(validSpec, featureDir)
    await writeFileChecksum(sjFp)
    await fs.writeFile(sjFp, "NEW CORRUPT", "utf-8")
    const result = await healthTool.execute({}, ctx)
    expect(result.output).toContain("CRITICAL")
    expect(result.metadata.features[0].spec_json).toBe("corrupted")
  })
})

describe("6. Health check with missing file reports it", () => {
  it("reports missing spec.json", async () => {
    const featureDir = await getFeatureDir()
    const sjFp = specJsonPath(featureDir)
    await fs.unlink(sjFp)
    const result = await healthTool.execute({}, ctx)
    expect(result.output).toContain("missing")
    expect(result.metadata.features[0].spec_json).toBe("missing")
  })
})

describe("7. Auto-fix repairs automatically", () => {
  it("repairs all issues", async () => {
    const sessionFp = sessionPath(worktree)
    const validSession: SessionState = {
      command: "plan",
      phase: "plan",
      featureDir: "001-auth",
      featureNumber: 1,
      featureName: "Auth Feature",
      nextStep: "tasks",
      lastResult: "plan created",
      history: ["spec-created"],
    }
    await writeSession(worktree, validSession)
    await writeSession(worktree, validSession)
    await writeFileChecksum(sessionFp)
    await fs.writeFile(sessionFp, "CORRUPT", "utf-8")
    const result = await healthTool.execute({ fix: true }, ctx)
    expect(result.metadata.session.status).toBe("restored")
    const restored = await readSession(worktree)
    expect(restored.phase).toBe("plan")
  })
})

describe("8. Report has correct structure", () => {
  it("has all required fields", async () => {
    const result = await healthTool.execute({}, ctx)
    expect(result.metadata).toBeDefined()
    expect(result.metadata.session).toBeDefined()
    expect(result.metadata.session.status).toBeDefined()
    expect(result.metadata.session.file).toBeDefined()
    expect(result.metadata.config).toBeDefined()
    expect(result.metadata.config.status).toBeDefined()
    expect(result.metadata.config.file).toBeDefined()
    expect(result.metadata.features).toBeDefined()
    expect(Array.isArray(result.metadata.features)).toBe(true)
    expect(result.metadata.overall).toBeDefined()
    expect(["healthy", "degraded", "critical"]).toContain(result.metadata.overall)
  })
})
