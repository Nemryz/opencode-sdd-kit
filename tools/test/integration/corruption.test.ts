import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import auditTool from "../../speckit-audit"
import {
  readConfig,
  readSession,
  readSpecJson,
  writeSession,
  writeSpecJson,
  writeWithBackup,
  sessionPath,
  specJsonPath,
  corruptionWarnings,
  clearCorruptionWarnings,
  pushCorruptionWarning,
  CorruptionWarning,
  makeSpecJson,
  specsDirPath,
} from "../../shared/types"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
  clearCorruptionWarnings()
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
  clearCorruptionWarnings()
})

describe("corruption warnings", () => {
  it("emits warning for corrupt session.json", async () => {
    const sp = sessionPath(worktree)
    await fs.mkdir(path.dirname(sp), { recursive: true })
    await fs.writeFile(sp, "{invalid json", "utf-8")
    clearCorruptionWarnings()
    await readSession(worktree)
    expect(corruptionWarnings.length).toBeGreaterThanOrEqual(1)
    expect(corruptionWarnings[0].file).toBe(sp)
  })

  it("emits warning for corrupt spec.json", async () => {
    const specDir = path.join(specsDirPath(worktree), "001-auth")
    await fs.mkdir(specDir, { recursive: true })
    const sjp = specJsonPath(specDir)
    await fs.writeFile(sjp, "{bad", "utf-8")
    clearCorruptionWarnings()
    await readSpecJson(specDir)
    expect(corruptionWarnings.length).toBeGreaterThanOrEqual(1)
    expect(corruptionWarnings[0].file).toBe(sjp)
  })

  it("emits warning for corrupt config.json", async () => {
    const cp = path.join(worktree, ".opencode", "spec-memory", "config.json")
    await fs.mkdir(path.dirname(cp), { recursive: true })
    await fs.writeFile(cp, "{invalid", "utf-8")
    clearCorruptionWarnings()
    await readConfig(worktree)
    expect(corruptionWarnings.length).toBeGreaterThanOrEqual(1)
    expect(corruptionWarnings[0].file).toBe(cp)
  })

  it("appears in audit findings", async () => {
    const sp = sessionPath(worktree)
    await fs.mkdir(path.dirname(sp), { recursive: true })
    await fs.writeFile(sp, "{invalid", "utf-8")
    clearCorruptionWarnings()
    await readSession(worktree)
    await createConstitution(worktree)
    const result = await auditTool.execute({}, ctx)
    const findings = result.metadata?.findings ?? []
    const corruptionFindings = findings.filter((f: { category: string }) => f.category === "corruption")
    expect(corruptionFindings.length).toBeGreaterThanOrEqual(1)
  })

  it("clearCorruptionWarnings resets array", () => {
    pushCorruptionWarning("/tmp/test.json", "test error")
    expect(corruptionWarnings.length).toBe(1)
    clearCorruptionWarnings()
    expect(corruptionWarnings.length).toBe(0)
  })

  it("deduplicates warnings for same file and message", () => {
    pushCorruptionWarning("/tmp/test.json", "test error")
    pushCorruptionWarning("/tmp/test.json", "test error")
    pushCorruptionWarning("/tmp/test.json", "different error")
    expect(corruptionWarnings.length).toBe(2)
    clearCorruptionWarnings()
  })

  it("no warnings for valid files", async () => {
    await createConstitution(worktree)
    clearCorruptionWarnings()
    await readSession(worktree)
    expect(corruptionWarnings.length).toBe(0)
  })

  it("warns on empty session.json (SyntaxError edge case)", async () => {
    const sp = sessionPath(worktree)
    await fs.mkdir(path.dirname(sp), { recursive: true })
    await fs.writeFile(sp, "", "utf-8")
    clearCorruptionWarnings()
    await readSession(worktree)
    expect(corruptionWarnings.length).toBeGreaterThanOrEqual(1)
    expect(corruptionWarnings[0].file).toBe(sp)
  })

  it("warns on empty spec.json (SyntaxError edge case)", async () => {
    const specDir = path.join(specsDirPath(worktree), "001-auth")
    await fs.mkdir(specDir, { recursive: true })
    const sjp = specJsonPath(specDir)
    await fs.writeFile(sjp, "", "utf-8")
    clearCorruptionWarnings()
    await readSpecJson(specDir)
    expect(corruptionWarnings.length).toBeGreaterThanOrEqual(1)
    expect(corruptionWarnings[0].file).toBe(sjp)
  })
})

describe("auto restore from backup", () => {
  it("restores spec.json from backup when current is corrupt", async () => {
    const specDir = path.join(specsDirPath(worktree), "001-auth")
    await fs.mkdir(specDir, { recursive: true })
    const sjp = specJsonPath(specDir)
    const validSpec = makeSpecJson("auth", 1)
    await writeSpecJson(validSpec, specDir)
    await writeWithBackup(sjp, JSON.stringify(validSpec), worktree)
    await fs.writeFile(sjp, "{corrupt", "utf-8")
    clearCorruptionWarnings()
    const result = await readSpecJson(specDir)
    expect(result).not.toBeNull()
    expect(result?.feature_name).toBe("auth")
  })

  it("restores session.json from backup when current is corrupt", async () => {
    const sp = sessionPath(worktree)
    await fs.mkdir(path.dirname(sp), { recursive: true })
    const validSession = { command: null, phase: "plan" as const, featureDir: "001-auth", featureNumber: 1, featureName: "auth", history: ["/spec"], lastResult: null, nextStep: "/plan" }
    await writeSession(worktree, validSession)
    const validSession2 = { command: null, phase: "tasks" as const, featureDir: "001-auth", featureNumber: 1, featureName: "auth", history: ["/spec", "/plan"], lastResult: null, nextStep: "/tasks" }
    await writeSession(worktree, validSession2)
    await fs.writeFile(sp, "{corrupt", "utf-8")
    clearCorruptionWarnings()
    const result = await readSession(worktree)
    expect(result.phase).toBe("plan")
    expect(result.featureDir).toBe("001-auth")
  })

  it("tries multiple backups, uses first valid one", async () => {
    const specDir = path.join(specsDirPath(worktree), "001-auth")
    await fs.mkdir(specDir, { recursive: true })
    const sjp = specJsonPath(specDir)
    const backupDir = path.join(worktree, ".opencode", "backups")
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(path.join(backupDir, "spec.json.1000.bak"), "{invalid", "utf-8")
    const validSpec = makeSpecJson("auth", 1)
    await fs.writeFile(path.join(backupDir, "spec.json.2000.bak"), JSON.stringify(validSpec), "utf-8")
    await fs.writeFile(sjp, "{corrupt", "utf-8")
    clearCorruptionWarnings()
    const result = await readSpecJson(specDir)
    expect(result).not.toBeNull()
    expect(result?.feature_name).toBe("auth")
  })

  it("returns null when no valid backups exist", async () => {
    const specDir = path.join(specsDirPath(worktree), "001-auth")
    await fs.mkdir(specDir, { recursive: true })
    const sjp = specJsonPath(specDir)
    const backupDir = path.join(worktree, ".opencode", "backups")
    await fs.mkdir(backupDir, { recursive: true })
    await fs.writeFile(path.join(backupDir, "spec.json.1000.bak"), "{invalid", "utf-8")
    await fs.writeFile(sjp, "{corrupt", "utf-8")
    clearCorruptionWarnings()
    const result = await readSpecJson(specDir)
    expect(result).toBeNull()
  })

  it("returns null when backup directory is missing", async () => {
    const specDir = path.join(specsDirPath(worktree), "001-auth")
    await fs.mkdir(specDir, { recursive: true })
    const sjp = specJsonPath(specDir)
    await fs.writeFile(sjp, "{corrupt", "utf-8")
    clearCorruptionWarnings()
    const result = await readSpecJson(specDir)
    expect(result).toBeNull()
  })
})
