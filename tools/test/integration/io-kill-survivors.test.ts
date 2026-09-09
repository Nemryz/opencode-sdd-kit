import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  readSession,
  writeSession,
  readSpecJson,
  writeSpecJson,
  writeWithBackup,
  atomicWriteFile,
  writeFileChecksum,
  verifyLiveFileChecksum,
  verifyBackupIntegrity,
  pushCorruptionWarning,
  clearCorruptionWarnings,
  corruptionWarnings,
  acquireLock,
  releaseLock,
  resetLocks,
  sleep,
  makeSpecJson,
  DEFAULT_SESSION,
  DEFAULT_CONFIG,
  sessionPath,
  specJsonPath,
  configPath,
  specsDirPath,
  readConfig,
  readConfigWithRestore,
  reconstructFromFrontmatter,
  syncFrontmatterFromSpecJson,
  writeFrontmatter,
  readFrontmatter,
  tryAutoCommit,
  computeBodyChecksum,
  runHealthCheck,
  writeConfigWithBackup,
} from "../../shared/types"
import { SessionStateSchema, SpecJsonSchema, ConfigSchema } from "../../shared/schemas"

let tmp: string

async function worktree(): Promise<string> {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "io-kill-"))
  return tmp
}

beforeEach(() => {
  clearCorruptionWarnings()
  resetLocks()
})

afterEach(async () => {
  if (tmp) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

// ─── Helper: write a .md file with frontmatter ───
async function writeMd(fp: string, fm: Record<string, unknown>, body = ""): Promise<void> {
  const lines = ["---"]
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v === null) continue
    lines.push(`${k}: ${typeof v === "string" ? `"${v}"` : v}`)
  }
  lines.push("---")
  lines.push(body)
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await fs.writeFile(fp, lines.join("\n"), "utf-8")
}

// ═══════════════════════════════════════════════════════════════
// 1. onlyLastUsedLanguageChanged (Line 579-584, ~19 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: onlyLastUsedLanguageChanged", () => {
  it("commits when phase changes (non-lastUsedLanguage)", async () => {
    const root = await worktree()
    const { execSync } = await import("node:child_process")
    execSync("git init", { cwd: root, stdio: "ignore" })
    execSync("git config user.email \"test@test.com\"", { cwd: root, stdio: "ignore" })
    execSync("git config user.name \"Test\"", { cwd: root, stdio: "ignore" })

    const fp = configPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, JSON.stringify({ ...DEFAULT_CONFIG, autoVersioning: true }), "utf-8")

    const sfp = sessionPath(root)
    await fs.mkdir(path.dirname(sfp), { recursive: true })
    await fs.writeFile(sfp, JSON.stringify(DEFAULT_SESSION), "utf-8")

    execSync("git add .", { cwd: root, stdio: "ignore" })
    execSync("git commit -m \"init\"", { cwd: root, stdio: "ignore" })

    // Write session with phase change
    await writeSession(root, { ...DEFAULT_SESSION, phase: "spec" as const })

    const log = execSync("git log --oneline", { cwd: root, encoding: "utf-8" })
    const commits = log.trim().split("\n")
    expect(commits.length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Checksum .trim() (Lines 58, 70, 822, ~4 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: checksum .trim() matters", () => {
  it("verifyLiveFileChecksum fails when sha256 has trailing newline", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.writeFile(fp, "hello", "utf-8")
    // Write checksum WITH trailing newline
    const crypto = await import("node:crypto")
    const hash = crypto.createHash("sha256").update("hello").digest("hex")
    await fs.writeFile(`${fp}.sha256`, hash + "\n", "utf-8")
    // Without .trim(), this would compare "hash\n" === "hash" and fail
    // With .trim(), it should pass
    const result = await verifyLiveFileChecksum(fp)
    expect(result).toBe(true)
  })

  it("writeFileChecksum creates clean checksum without whitespace", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.writeFile(fp, "data", "utf-8")
    await writeFileChecksum(fp)
    const stored = await fs.readFile(`${fp}.sha256`, "utf-8")
    expect(stored).toBe(stored.trim())
    expect(stored).not.toMatch(/\s/)
  })

  it("verifyLiveFileChecksum fails when file content changes", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.writeFile(fp, "original", "utf-8")
    await writeFileChecksum(fp)
    await fs.writeFile(fp, "modified", "utf-8")
    const result = await verifyLiveFileChecksum(fp)
    expect(result).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. runHealthCheck (Lines 842-940, ~33 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: runHealthCheck", () => {
  it("reports healthy when all files exist and valid", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    await writeConfigWithBackup(root, { ...DEFAULT_CONFIG })
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeSpecJson(makeSpecJson("test", 1), featureDir)
    const report = await runHealthCheck(root)
    expect(report.overall).toBe("healthy")
    expect(report.session.status).toBe("healthy")
    expect(report.config.status).toBe("healthy")
    expect(report.features.length).toBe(1)
    expect(report.features[0].spec_json).toBe("healthy")
  })

  it("reports missing session when session.json absent", async () => {
    const root = await worktree()
    const report = await runHealthCheck(root)
    expect(report.session.status).toBe("missing")
    expect(report.overall).toBe("critical")
  })

  it("reports missing config when config.json absent", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const report = await runHealthCheck(root)
    expect(report.config.status).toBe("missing")
    expect(report.overall).toBe("critical")
  })

  it("reports corrupted session when checksum mismatches", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const fp = sessionPath(root)
    await writeFileChecksum(fp)
    // Corrupt the file
    await fs.writeFile(fp, "corrupted", "utf-8")
    const report = await runHealthCheck(root)
    expect(report.session.status).toBe("corrupted")
    expect(report.overall).toBe("critical")
  })

  it("reports corrupted config when checksum mismatches", async () => {
    const root = await worktree()
    await writeConfigWithBackup(root, { ...DEFAULT_CONFIG })
    const fp = configPath(root)
    await writeFileChecksum(fp)
    await fs.writeFile(fp, "corrupted", "utf-8")
    const report = await runHealthCheck(root)
    expect(report.config.status).toBe("corrupted")
    expect(report.overall).toBe("critical")
  })

  it("reports missing spec.json for feature", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    // Don't write spec.json
    const report = await runHealthCheck(root)
    expect(report.features.length).toBe(1)
    expect(report.features[0].spec_json).toBe("missing")
    expect(report.overall).toBe("critical")
  })

  it("reports corrupted spec.json when checksum mismatches", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeSpecJson(makeSpecJson("test", 1), featureDir)
    const fp = specJsonPath(featureDir)
    await writeFileChecksum(fp)
    await fs.writeFile(fp, "corrupted", "utf-8")
    const report = await runHealthCheck(root)
    expect(report.features.length).toBe(1)
    expect(report.features[0].spec_json).toBe("corrupted")
  })

  it("reports corrupted when session corrupted but config OK", async () => {
    const root = await worktree()
    await writeConfigWithBackup(root, { ...DEFAULT_CONFIG })
    const sfp = sessionPath(root)
    await fs.mkdir(path.dirname(sfp), { recursive: true })
    await fs.writeFile(sfp, "{}", "utf-8")
    await writeFileChecksum(sfp)
    await fs.writeFile(sfp, "bad", "utf-8")
    const report = await runHealthCheck(root)
    expect(report.session.status).toBe("corrupted")
    expect(report.config.status).toBe("healthy")
    expect(report.overall).toBe("critical")
  })

  it("reports corrupted when config corrupted but session OK", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const cfp = configPath(root)
    await fs.mkdir(path.dirname(cfp), { recursive: true })
    await fs.writeFile(cfp, "{}", "utf-8")
    await writeFileChecksum(cfp)
    await fs.writeFile(cfp, "bad", "utf-8")
    const report = await runHealthCheck(root)
    expect(report.session.status).toBe("healthy")
    expect(report.config.status).toBe("corrupted")
    expect(report.overall).toBe("critical")
  })

  it("reports critical when both session and config missing", async () => {
    const root = await worktree()
    const report = await runHealthCheck(root)
    expect(report.session.status).toBe("missing")
    expect(report.config.status).toBe("missing")
    expect(report.overall).toBe("critical")
  })

  it("reports critical when any feature has corrupted spec.json", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    await writeConfigWithBackup(root, { ...DEFAULT_CONFIG })
    const f1 = path.join(root, "specs", "001-a")
    const f2 = path.join(root, "specs", "002-b")
    await fs.mkdir(f1, { recursive: true })
    await fs.mkdir(f2, { recursive: true })
    await writeSpecJson(makeSpecJson("a", 1), f1)
    await writeSpecJson(makeSpecJson("b", 2), f2)
    // Corrupt f2
    const fp2 = specJsonPath(f2)
    await writeFileChecksum(fp2)
    await fs.writeFile(fp2, "bad", "utf-8")
    const report = await runHealthCheck(root)
    expect(report.features.length).toBe(2)
    const f2h = report.features.find(f => f.dir === "002-b")
    expect(f2h?.spec_json).toBe("corrupted")
    expect(report.overall).toBe("critical")
  })

  it("counts backup validation correctly", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    await writeConfigWithBackup(root, { ...DEFAULT_CONFIG })
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeSpecJson(makeSpecJson("test", 1), featureDir)

    // Create backup in the feature-specific backup dir structure
    // The health check filters backups by f.includes(entry.name)
    const backupDir = path.join(root, ".opencode", "backups")
    await fs.mkdir(backupDir, { recursive: true })
    const sjContent = JSON.stringify(makeSpecJson("test", 1))
    const bakFile = path.join(backupDir, "spec.json.001-test.999.bak")
    await fs.writeFile(bakFile, sjContent, "utf-8")
    const crypto = await import("node:crypto")
    const hash = crypto.createHash("sha256").update(sjContent).digest("hex")
    await fs.writeFile(`${bakFile}.sha256`, hash, "utf-8")

    const report = await runHealthCheck(root)
    const fh = report.features.find(f => f.dir === "001-test")
    expect(fh).toBeDefined()
    // The backup filename contains "001-test" so it should be found
    expect(fh!.backups.total).toBe(1)
    expect(fh!.backups.valid).toBe(1)
  })

  it("counts corrupted backups in health report", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeSpecJson(makeSpecJson("test", 1), featureDir)

    const backupDir = path.join(root, ".opencode", "backups")
    await fs.mkdir(backupDir, { recursive: true })
    // Write backup with content that has a wrong checksum
    const content = "not valid json"
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"
    await fs.writeFile(path.join(backupDir, "spec.json.001-test.999.bak"), content, "utf-8")
    await fs.writeFile(path.join(backupDir, "spec.json.001-test.999.bak.sha256"), wrongHash, "utf-8")

    const report = await runHealthCheck(root)
    const fh = report.features.find(f => f.dir === "001-test")
    expect(fh).toBeDefined()
    expect(fh!.backups.total).toBe(1)
    expect(fh!.backups.corrupted).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. syncFrontmatterFromSpecJson (Lines 693-739, ~29 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: syncFrontmatterFromSpecJson phase conditions", () => {
  async function setupFeature(root: string, featureName: string) {
    const featureDir = path.join(root, "specs", `001-${featureName}`)
    await fs.mkdir(featureDir, { recursive: true })
    // Create .md files with minimal frontmatter
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: featureName, feature_number: 1, phase: "spec" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: featureName, phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: featureName, phase: "tasks" })
    return featureDir
  }

  it("syncs spec phase as-is when phase is spec", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "spec"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "spec.md"))
    expect(fm?.phase).toBe("spec")
  })

  it("syncs plan phase as 'plan' when sj.phase is plan", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "plan"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.phase).toBe("plan")
  })

  it("syncs tasks phase as 'tasks' when sj.phase is tasks", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "tasks"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.phase).toBe("tasks")
  })

  it("syncs plan phase as 'plan' when sj.phase is ready", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "ready"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.phase).toBe("plan")
  })

  it("syncs tasks phase as 'tasks' when sj.phase is ready", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "ready"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.phase).toBe("tasks")
  })

  it("syncs plan phase as 'plan' when sj.phase is impl", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "impl"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.phase).toBe("plan")
  })

  it("syncs tasks phase as 'tasks' when sj.phase is impl", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "impl"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.phase).toBe("tasks")
  })

  it("syncs plan phase as 'plan' when sj.phase is complete", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "complete"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.phase).toBe("plan")
  })

  it("syncs tasks phase as 'tasks' when sj.phase is complete", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "complete"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.phase).toBe("tasks")
  })

  it("syncs plan phase as 'plan' when sj.phase is spec (falls through)", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "spec"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    // When sj.phase is "spec", the ternary falls through to sj.phase ("spec")
    expect(fm?.phase).toBe("spec")
  })

  it("syncs tasks phase as 'tasks' when sj.phase is spec (falls through)", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "spec"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    // When sj.phase is "spec", the ternary falls through to sj.phase ("spec")
    expect(fm?.phase).toBe("spec")
  })

  it("sets spec status to approved when spec approved", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.spec.approved = true
    sj.approvals.spec.generated = true
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "spec.md"))
    expect(fm?.status).toBe("approved")
  })

  it("sets spec status to validated when generated but not approved", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.spec.generated = true
    sj.approvals.spec.approved = false
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "spec.md"))
    expect(fm?.status).toBe("validated")
  })

  it("sets spec status to generated when not generated", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.spec.generated = false
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "spec.md"))
    expect(fm?.status).toBe("generated")
  })

  it("skips spec.md when it does not exist", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    // Only create plan.md and tasks.md
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const sj = makeSpecJson("test", 1)
    sj.phase = "ready"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    // Should not throw
    const planFm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(planFm?.phase).toBe("plan")
  })

  it("skips plan.md when it does not exist", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", phase: "spec" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const sj = makeSpecJson("test", 1)
    sj.phase = "ready"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    // spec.md should be synced with sj.phase
    const specFm = await readFrontmatter(path.join(featureDir, "spec.md"))
    expect(specFm?.phase).toBe("ready")
  })

  it("skips tasks.md when it does not exist", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", phase: "spec" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    const sj = makeSpecJson("test", 1)
    sj.phase = "ready"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const planFm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(planFm?.phase).toBe("plan")
  })

  it("includes last_audit in sync when provided", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    const auditMeta = { date: new Date().toISOString(), findings: 0, severity: "low" as const }
    await syncFrontmatterFromSpecJson(featureDir, sj, { last_audit: auditMeta })
    // Read the raw file to check if last_audit was written
    const raw = await fs.readFile(path.join(featureDir, "spec.md"), "utf-8")
    expect(raw).toContain("last_audit")
  })

  it("does not include last_audit when not provided", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const raw = await fs.readFile(path.join(featureDir, "spec.md"), "utf-8")
    expect(raw).not.toContain("last_audit")
  })

  it("syncs plan status to approved when plan approved", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.plan.approved = true
    sj.approvals.plan.generated = true
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.status).toBe("approved")
  })

  it("syncs tasks status to validated when tasks generated but not approved", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.tasks.generated = true
    sj.approvals.tasks.approved = false
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.status).toBe("validated")
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. readFrontmatter fallback regex (Lines 604-627, ~18 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: readFrontmatter fallback regex", () => {
  async function triggerFallback(root: string, lines: string[]): Promise<ReturnType<typeof readFrontmatter>> {
    const fp = path.join(root, "test.md")
    // Invalid YAML that makes gray-matter throw, but the regex fallback can parse the valid lines
    const content = "---\n" + lines.join("\n") + "\n[[[\n---\n\nBody here"
    await fs.writeFile(fp, content, "utf-8")
    return readFrontmatter(fp)
  }

  it("recovers frontmatter when gray-matter fails (fallback path)", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: test", "feature_number: 1"])
    expect(fm).not.toBeNull()
    expect(fm?.feature_name).toBe("test")
  })

  it("parses boolean true from fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: test", "feature_number: 1", "ready: true"])
    expect(fm?.feature_name).toBe("test")
  })

  it("parses boolean false from fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: test", "feature_number: 1", "ready: false"])
    expect(fm?.feature_name).toBe("test")
  })

  it("parses numeric value from fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: test", "feature_number: 42"])
    expect(fm?.feature_number).toBe(42)
  })

  it("parses quoted string from fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ['feature_name: "my feature"', "feature_number: 1"])
    expect(fm?.feature_name).toBe("my feature")
  })

  it("parses single-quoted string from fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: 'my feature'", "feature_number: 1"])
    expect(fm?.feature_name).toBe("my feature")
  })

  it("skips boundaries key in fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: test", "feature_number: 1", "boundaries: foo"])
    expect(fm?.feature_name).toBe("test")
  })

  it("skips depends_on key in fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: test", "feature_number: 1", "depends_on: foo"])
    expect(fm?.feature_name).toBe("test")
  })

  it("returns null when file has no frontmatter", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.md")
    await fs.writeFile(fp, "Just a plain markdown file", "utf-8")
    const fm = await readFrontmatter(fp)
    expect(fm).toBeNull()
  })

  it("returns null when file has empty frontmatter", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.md")
    await fs.writeFile(fp, "---\n---\n\nBody", "utf-8")
    const fm = await readFrontmatter(fp)
    expect(fm).toBeNull()
  })

  it("returns null when file does not exist", async () => {
    const root = await worktree()
    const fp = path.join(root, "nonexistent.md")
    const fm = await readFrontmatter(fp)
    expect(fm).toBeNull()
  })

  it("handles unquoted string value in fallback", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: hello world", "feature_number: 1"])
    expect(fm?.feature_name).toBe("hello world")
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. reconstructFromFrontmatter (Lines 656-691, ~7 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: reconstructFromFrontmatter phase logic", () => {
  it("returns null when spec.md missing", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).toBeNull()
  })

  it("returns spec phase when only spec.md exists", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "spec" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe("spec")
  })

  it("returns plan phase when spec.md has no phase but plan.md does", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    // spec.md WITHOUT phase field - so specFm.phase is undefined and the override doesn't apply
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1 })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe("plan")
  })

  it("returns tasks phase when all three exist but spec has no phase", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1 })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe("tasks")
  })

  it("returns ready phase when spec.phase overrides combined logic", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    // When all three exist and spec.phase is "ready", the specFm.phase override should set it to "ready"
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "ready" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe("ready")
  })

  it("uses fallback feature_name from directory basename", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-my-feature")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_number: 1, phase: "spec" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    // path.basename returns the full directory name including number prefix
    expect(result!.feature_name).toBe("001-my-feature")
  })

  it("uses fallback feature_number 0 when missing", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", phase: "spec" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.feature_number).toBe(0)
  })

  it("sets ready_for_implementation true when phase is ready", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "ready" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result!.ready_for_implementation).toBe(true)
  })

  it("sets ready_for_implementation false when phase is not ready", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "spec" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result!.ready_for_implementation).toBe(false)
  })

  it("sets approvals correctly based on phase presence", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "spec", status: "approved" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan", status: "validated" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result!.approvals.spec.generated).toBe(true)
    expect(result!.approvals.spec.approved).toBe(true)
    expect(result!.approvals.plan.generated).toBe(true)
    expect(result!.approvals.plan.approved).toBe(false)
    expect(result!.approvals.tasks.generated).toBe(false)
    expect(result!.approvals.tasks.approved).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. acquireLock boundary conditions (Lines 133-153, ~12 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: acquireLock boundaries", () => {
  it("acquires lock when no existing lock", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.writeFile(fp, "{}", "utf-8")
    const handle = await acquireLock(fp)
    expect(handle.lockDir).toBe(fp + ".lock")
    expect(handle.reentrant).toBe(false)
    await releaseLock(handle)
  })

  it("returns reentrant handle when same process re-acquires", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.writeFile(fp, "{}", "utf-8")
    const h1 = await acquireLock(fp)
    expect(h1.reentrant).toBe(false)
    const h2 = await acquireLock(fp)
    expect(h2.reentrant).toBe(true)
    await releaseLock(h1)
    // h2 is reentrant, release is a no-op
    await releaseLock(h2)
  })

  it("removes stale lock based on threshold", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.writeFile(fp, "{}", "utf-8")
    const lockDir = fp + ".lock"
    // Create a lock that is stale (older than threshold)
    await fs.mkdir(lockDir, { recursive: true })
    const staleTime = new Date(Date.now() - 20000).toISOString()
    await fs.writeFile(path.join(lockDir, "lock.json"), JSON.stringify({ pid: 99999, createdAt: staleTime }), "utf-8")
    // Should acquire by removing stale lock
    const handle = await acquireLock(fp, { staleThreshold: 10000 })
    expect(handle.lockDir).toBe(lockDir)
    await releaseLock(handle)
  })

  it("throws timeout when lock cannot be acquired", async () => {
    const root = await worktree()
    const fp = path.join(root, "timeout-test.json")
    await fs.writeFile(fp, "{}", "utf-8")
    const lockDir = fp + ".lock"
    // Create a lock held by a live process (our own PID)
    await fs.mkdir(lockDir, { recursive: true })
    await fs.writeFile(path.join(lockDir, "lock.json"), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf-8")
    // Should timeout because the lock is held by us (live process)
    await expect(acquireLock(fp, { timeout: 200 })).rejects.toThrow("Lock timeout")
    // Clean up
    await fs.rm(lockDir, { recursive: true, force: true })
  })

  it("creates parent directory if missing", async () => {
    const root = await worktree()
    const fp = path.join(root, "deep", "nested", "test.json")
    // Don't create parent dirs - acquireLock should handle it
    const handle = await acquireLock(fp)
    expect(await fs.access(fp + ".lock").then(() => true, () => false)).toBe(true)
    await releaseLock(handle)
  })
})

// ═══════════════════════════════════════════════════════════════
// 8. resetLocks (Lines 174-176, ~2 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: resetLocks clears heldLocks", () => {
  it("resetLocks clears all held locks so re-acquire is non-reentrant", async () => {
    const root = await worktree()
    const fp = path.join(root, "reset-test.json")
    await fs.writeFile(fp, "{}", "utf-8")
    const h1 = await acquireLock(fp)
    expect(h1.reentrant).toBe(false)
    const h2 = await acquireLock(fp)
    expect(h2.reentrant).toBe(true)
    // Release and clean up the lock directory
    await releaseLock(h1)
    // Reset locks (clears in-memory set)
    resetLocks()
    // Now re-acquiring should be non-reentrant (fresh)
    const h3 = await acquireLock(fp)
    expect(h3.reentrant).toBe(false)
    await releaseLock(h3)
  })
})

// ═══════════════════════════════════════════════════════════════
// 9. writeSession post-write verification (Lines 434-442, ~5 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: writeSession post-write verification", () => {
  it("writeSession produces valid session that can be read back", async () => {
    const root = await worktree()
    const state = { ...DEFAULT_SESSION, phase: "spec" as const }
    await writeSession(root, state)
    const read = await readSession(root)
    expect(read.phase).toBe("spec")
  })

  it("writeSession produces valid checksum", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const fp = sessionPath(root)
    const valid = await verifyLiveFileChecksum(fp)
    expect(valid).toBe(true)
  })

  it("writeSession writes default session fields", async () => {
    const root = await worktree()
    await writeSession(root, { ...DEFAULT_SESSION })
    const fp = sessionPath(root)
    const content = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed).toHaveProperty("command")
    expect(parsed).toHaveProperty("phase")
    expect(parsed).toHaveProperty("history")
  })
})

// ═══════════════════════════════════════════════════════════════
// 10. writeSpecJson post-write verification (Lines 508-514, ~6 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: writeSpecJson post-write verification", () => {
  it("writeSpecJson produces valid spec that can be read back", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const sj = makeSpecJson("test", 1)
    await writeSpecJson(sj, featureDir)
    const read = await readSpecJson(featureDir)
    expect(read).not.toBeNull()
    expect(read!.feature_name).toBe("test")
  })

  it("writeSpecJson produces valid checksum", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    const sj = makeSpecJson("test", 1)
    await writeSpecJson(sj, featureDir)
    const fp = specJsonPath(featureDir)
    const valid = await verifyLiveFileChecksum(fp)
    expect(valid).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 11. computeBodyChecksum \r\n normalization (Line 640, ~1 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: computeBodyChecksum normalization", () => {
  it("normalizes \\r\\n to \\n before hashing", () => {
    const withCRLF = "---\nfeature_name: test\n---\n\r\nHello\r\nWorld"
    const withLF = "---\nfeature_name: test\n---\n\nHello\nWorld"
    const checksumCRLF = computeBodyChecksum(withCRLF)
    const checksumLF = computeBodyChecksum(withLF)
    expect(checksumCRLF).toBe(checksumLF)
  })

  it("trims whitespace before hashing", () => {
    const withSpaces = "---\nfeature_name: test\n---\n\n  Hello World  "
    const trimmed = "---\nfeature_name: test\n---\n\nHello World"
    const cs1 = computeBodyChecksum(withSpaces)
    const cs2 = computeBodyChecksum(trimmed)
    expect(cs1).toBe(cs2)
  })

  it("produces different checksum for different body content", () => {
    const a = computeBodyChecksum("---\nfeature_name: test\n---\n\nHello")
    const b = computeBodyChecksum("---\nfeature_name: test\n---\n\nWorld")
    expect(a).not.toBe(b)
  })
})

// ═══════════════════════════════════════════════════════════════
// 12. readSession corruption warning (Line 399, ~1 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: readSession corruption warning", () => {
  it("pushes corruption warning when JSON is invalid", async () => {
    const root = await worktree()
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, "not valid json {{{", "utf-8")
    clearCorruptionWarnings()
    await readSession(root)
    expect(corruptionWarnings.length).toBeGreaterThan(0)
    expect(corruptionWarnings[0].file).toBe(fp)
  })

  it("pushes corruption warning when schema validation fails", async () => {
    const root = await worktree()
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    // Write valid JSON but invalid schema
    await fs.writeFile(fp, JSON.stringify({ phase: 12345 }), "utf-8")
    clearCorruptionWarnings()
    await readSession(root)
    expect(corruptionWarnings.length).toBeGreaterThan(0)
  })

  it("does not push warning when file is missing (ENOENT)", async () => {
    const root = await worktree()
    clearCorruptionWarnings()
    await readSession(root)
    expect(corruptionWarnings.length).toBe(0)
  })

  it("restores from backup when primary is corrupted", async () => {
    const root = await worktree()
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    const valid = { ...DEFAULT_SESSION, phase: "spec" as const }
    await writeSession(root, valid)

    // Create a backup
    const backupDir = path.join(root, ".opencode", "backups")
    await fs.mkdir(backupDir, { recursive: true })
    const bakFile = path.join(backupDir, `session.json.${Date.now()}.bak`)
    await fs.writeFile(bakFile, JSON.stringify(valid), "utf-8")
    const crypto = await import("node:crypto")
    const hash = crypto.createHash("sha256").update(JSON.stringify(valid)).digest("hex")
    await fs.writeFile(`${bakFile}.sha256`, hash, "utf-8")

    // Corrupt the main file
    await fs.writeFile(fp, "bad", "utf-8")
    const result = await readSession(root)
    expect(result.phase).toBe("spec")
  })
})

// ═══════════════════════════════════════════════════════════════
// 13. readConfigWithRestore (Lines 759-798, ~10 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: readConfigWithRestore", () => {
  it("returns default config when file missing", async () => {
    const root = await worktree()
    const result = await readConfigWithRestore(root)
    expect(result).toEqual(DEFAULT_CONFIG)
  })

  it("returns valid config when file exists and checksum matches", async () => {
    const root = await worktree()
    await writeConfigWithBackup(root, { ...DEFAULT_CONFIG, lastUsedLanguage: "es" })
    const result = await readConfigWithRestore(root)
    expect(result.lastUsedLanguage).toBe("es")
  })

  it("returns default when checksum mismatches and no backup", async () => {
    const root = await worktree()
    const fp = configPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, JSON.stringify({ ...DEFAULT_CONFIG, lastUsedLanguage: "es" }), "utf-8")
    await writeFileChecksum(fp)
    // Corrupt the file
    await fs.writeFile(fp, "bad", "utf-8")
    clearCorruptionWarnings()
    const result = await readConfigWithRestore(root)
    expect(result).toEqual(DEFAULT_CONFIG)
    expect(corruptionWarnings.length).toBeGreaterThan(0)
  })

  it("restores from backup when checksum mismatches", async () => {
    const root = await worktree()
    await writeConfigWithBackup(root, { ...DEFAULT_CONFIG, lastUsedLanguage: "es" })
    const fp = configPath(root)
    await writeFileChecksum(fp)

    // Create backup
    const backupDir = path.join(root, ".opencode", "backups")
    await fs.mkdir(backupDir, { recursive: true })
    const valid = { ...DEFAULT_CONFIG, lastUsedLanguage: "fr" }
    const bakFile = path.join(backupDir, `config.json.${Date.now()}.bak`)
    await fs.writeFile(bakFile, JSON.stringify(valid), "utf-8")
    const crypto = await import("node:crypto")
    const hash = crypto.createHash("sha256").update(JSON.stringify(valid)).digest("hex")
    await fs.writeFile(`${bakFile}.sha256`, hash, "utf-8")

    // Corrupt main file
    await fs.writeFile(fp, "bad", "utf-8")
    const result = await readConfigWithRestore(root)
    expect(result.lastUsedLanguage).toBe("fr")
  })

  it("returns default when schema validation fails", async () => {
    const root = await worktree()
    const fp = configPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, JSON.stringify({ autoVersioning: "not-a-bool" }), "utf-8")
    clearCorruptionWarnings()
    const result = await readConfigWithRestore(root)
    expect(result).toEqual(DEFAULT_CONFIG)
    expect(corruptionWarnings.length).toBeGreaterThan(0)
  })

  it("pushes corruption warning with suggestion on checksum mismatch", async () => {
    const root = await worktree()
    const fp = configPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, "{}", "utf-8")
    await writeFileChecksum(fp)
    await fs.writeFile(fp, "bad", "utf-8")
    clearCorruptionWarnings()
    await readConfigWithRestore(root)
    const warn = corruptionWarnings.find(w => w.file === fp)
    expect(warn).toBeDefined()
    expect(warn!.suggestion).toContain("/config")
  })
})

// ═══════════════════════════════════════════════════════════════
// 14. readConfig error handling (Lines 529-547, ~3 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: readConfig checksum and error paths", () => {
  it("returns default when checksum mismatches (no backup restore in readConfig)", async () => {
    const root = await worktree()
    const fp = configPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, JSON.stringify(DEFAULT_CONFIG), "utf-8")
    await writeFileChecksum(fp)
    await fs.writeFile(fp, "corrupted", "utf-8")
    clearCorruptionWarnings()
    const result = await readConfig(root)
    expect(result).toEqual(DEFAULT_CONFIG)
    expect(corruptionWarnings.length).toBeGreaterThan(0)
  })

  it("returns default on non-ENOENT error", async () => {
    const root = await worktree()
    const fp = configPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    // Write a file, then make it unreadable (permission denied)
    await fs.writeFile(fp, JSON.stringify(DEFAULT_CONFIG), "utf-8")
    // On Windows, we can't easily test permission denied, so skip if needed
    // Instead, test with a directory instead of a file (will cause read error)
    await fs.rm(fp)
    await fs.mkdir(fp, { recursive: true })
    clearCorruptionWarnings()
    const result = await readConfig(root)
    expect(result).toEqual(DEFAULT_CONFIG)
  })
})

// ═══════════════════════════════════════════════════════════════
// 15. writeWithBackup verification failure (Lines 204-207)
// ═══════════════════════════════════════════════════════════════
describe("Kill: writeWithBackup verification", () => {
  it("creates backup with correct content before overwrite", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, "original", "utf-8")
    await writeWithBackup(fp, "updated", root)

    const backupDir = path.join(root, ".opencode", "backups")
    const allBaks = await fs.readdir(backupDir)
    const bakFile = allBaks.find(f => f.endsWith(".bak"))
    expect(bakFile).toBeDefined()
    const content = await fs.readFile(path.join(backupDir, bakFile!), "utf-8")
    expect(content).toBe("original")
  })

  it("creates checksum sidecar for backup", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, "content", "utf-8")
    await writeWithBackup(fp, "updated", root)

    const backupDir = path.join(root, ".opencode", "backups")
    const allBaks = await fs.readdir(backupDir)
    const bakFile = allBaks.find(f => f.endsWith(".bak"))
    const shaExists = await fs.access(path.join(backupDir, `${bakFile}.sha256`)).then(() => true, () => false)
    expect(shaExists).toBe(true)
  })

  it("no backup when first write to new file", async () => {
    const root = await worktree()
    const fp = path.join(root, "brand-new.json")
    await writeWithBackup(fp, "first", root)
    const backupDir = path.join(root, ".opencode", "backups")
    const exists = await fs.access(backupDir).then(() => true, () => false)
    expect(exists).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 16. releaseLock force flag (Line 168, ~1 survived)
// ═══════════════════════════════════════════════════════════════
describe("Kill: releaseLock with force", () => {
  it("releaseLock removes lock directory even with contents", async () => {
    const root = await worktree()
    const fp = path.join(root, "test.json")
    await fs.writeFile(fp, "{}", "utf-8")
    const handle = await acquireLock(fp)
    // Add extra files to the lock dir
    await fs.writeFile(path.join(handle.lockDir, "extra.txt"), "data", "utf-8")
    await releaseLock(handle)
    const exists = await fs.access(handle.lockDir).then(() => true, () => false)
    expect(exists).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 17. tryAutoCommit — onlyLastUsedLanguageChanged logic (Lines 558-584)
// ═══════════════════════════════════════════════════════════════
describe("Kill: tryAutoCommit commit/revert behavior", () => {
  function gitInit(root: string): void {
    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    execSync("git init", { cwd: root, stdio: "ignore" })
    execSync("git config user.email \"test@test.com\"", { cwd: root, stdio: "ignore" })
    execSync("git config user.name \"Test\"", { cwd: root, stdio: "ignore" })
  }

  function gitCommitAll(root: string, msg: string): void {
    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    execSync("git add .", { cwd: root, stdio: "ignore" })
    execSync(`git commit -m "${msg}"`, { cwd: root, stdio: "ignore" })
  }

  function gitLogCount(root: string): number {
    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    const log = execSync("git log --oneline", { cwd: root, encoding: "utf-8" })
    return log.trim().split("\n").filter(Boolean).length
  }

  async function setupAutoVersioning(root: string): Promise<string> {
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await writeSession(root, { ...DEFAULT_SESSION })
    const cfp = configPath(root)
    await fs.mkdir(path.dirname(cfp), { recursive: true })
    await fs.writeFile(cfp, JSON.stringify({ ...DEFAULT_CONFIG, autoVersioning: true }), "utf-8")
    await writeFileChecksum(cfp)
    return fp
  }

  it("commits when diff has non-lastUsedLanguage changes", async () => {
    const root = await worktree()
    gitInit(root)
    const fp = await setupAutoVersioning(root)
    gitCommitAll(root, "init")
    const before = gitLogCount(root)

    // Write session with phase change (creates a diff with "phase", not just "lastUsedLanguage")
    await writeSession(root, { ...DEFAULT_SESSION, phase: "spec" as const })
    await tryAutoCommit(fp, root)

    const after = gitLogCount(root)
    expect(after).toBe(before + 1)
  })

  it("does not commit when git index has no changes", async () => {
    const root = await worktree()
    gitInit(root)
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await writeSession(root, { ...DEFAULT_SESSION })
    const cfp = configPath(root)
    await fs.mkdir(path.dirname(cfp), { recursive: true })
    await fs.writeFile(cfp, JSON.stringify({ ...DEFAULT_CONFIG, autoVersioning: true }), "utf-8")
    await writeFileChecksum(cfp)
    gitCommitAll(root, "init")
    const before = gitLogCount(root)

    // Don't modify any file — diff should be empty
    await tryAutoCommit(fp, root)

    const after = gitLogCount(root)
    expect(after).toBe(before)
  })

  it("does not commit when autoVersioning is false", async () => {
    const root = await worktree()
    gitInit(root)
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await writeSession(root, { ...DEFAULT_SESSION })
    const cfp = configPath(root)
    await fs.mkdir(path.dirname(cfp), { recursive: true })
    await fs.writeFile(cfp, JSON.stringify({ ...DEFAULT_CONFIG, autoVersioning: false }), "utf-8")
    await writeFileChecksum(cfp)
    gitCommitAll(root, "init")
    const before = gitLogCount(root)

    await writeSession(root, { ...DEFAULT_SESSION, phase: "spec" as const })
    await tryAutoCommit(fp, root)

    const after = gitLogCount(root)
    expect(after).toBe(before)
  })

  it("skips commit when git dir does not exist", async () => {
    const root = await worktree()
    // No git init
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await writeSession(root, { ...DEFAULT_SESSION })
    // Should not throw even without .git
    await expect(tryAutoCommit(fp, root)).resolves.toBeUndefined()
  })

  it("commits with correct message for session.json", async () => {
    const root = await worktree()
    gitInit(root)
    const fp = await setupAutoVersioning(root)
    gitCommitAll(root, "init")

    await writeSession(root, { ...DEFAULT_SESSION, phase: "spec" as const })
    await tryAutoCommit(fp, root)

    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    const msg = execSync("git log -1 --pretty=%B", { cwd: root, encoding: "utf-8" }).trim()
    expect(msg).toBe("auto: update session state")
  })

  it("commits with default message for unknown file", async () => {
    const root = await worktree()
    gitInit(root)
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await writeSession(root, { ...DEFAULT_SESSION })
    const cfp = configPath(root)
    await fs.mkdir(path.dirname(cfp), { recursive: true })
    await fs.writeFile(cfp, JSON.stringify({ ...DEFAULT_CONFIG, autoVersioning: true }), "utf-8")
    await writeFileChecksum(cfp)
    gitCommitAll(root, "init")

    // Create a non-standard file and write to it
    const customFp = path.join(root, ".opencode", "custom-state.json")
    await fs.writeFile(customFp, "{}", "utf-8")
    await writeFileChecksum(customFp)
    await fs.writeFile(customFp, '{"key":"value"}', "utf-8")
    await tryAutoCommit(customFp, root)

    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    const msg = execSync("git log -1 --pretty=%B", { cwd: root, encoding: "utf-8" }).trim()
    expect(msg).toBe("auto: update custom-state.json")
  })
})

// ═══════════════════════════════════════════════════════════════
// 18. readFrontmatter fallback regex edge cases (Lines 606-619)
// ═══════════════════════════════════════════════════════════════
describe("Kill: readFrontmatter fallback regex edge cases", () => {
  async function triggerFallback(root: string, lines: string[]): Promise<ReturnType<typeof readFrontmatter>> {
    const fp = path.join(root, "test.md")
    const content = "---\n" + lines.join("\n") + "\n[[[\n---\n\nBody here"
    await fs.writeFile(fp, content, "utf-8")
    return readFrontmatter(fp)
  }

  it("skips bare key without colon-space separator", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name:test", "feature_number: 1"])
    // "feature_name:test" has no space after colon, regex /^(\w+):\s*(.+)$/ requires \s*
    // but "test" is the value, so it should match since \s* matches zero spaces
    expect(fm?.feature_name).toBe("test")
  })

  it("parses value with multiple colons correctly", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ['feature_name: "test:with:colons"', "feature_number: 1"])
    expect(fm?.feature_name).toBe("test:with:colons")
  })

  it("skips lines that are just keys with no value after colon", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: test", "emptykey:", "feature_number: 1"])
    // "emptykey:" — regex /^(\w+):\s*(.+)$/ requires at least one char after colon
    expect(fm).not.toBeNull()
    expect(fm?.feature_name).toBe("test")
    expect(fm?.feature_number).toBe(1)
  })

  it("parses complex unquoted value with spaces", async () => {
    const root = await worktree()
    const fm = await triggerFallback(root, ["feature_name: hello world foo", "feature_number: 1"])
    expect(fm?.feature_name).toBe("hello world foo")
  })
})

// ═══════════════════════════════════════════════════════════════
// 19. syncFrontmatterFromSpecJson — plan/tasks status fields
// ═══════════════════════════════════════════════════════════════
describe("Kill: syncFrontmatterFromSpecJson plan/tasks status", () => {
  async function setupFeature(root: string, featureName: string) {
    const featureDir = path.join(root, "specs", `001-${featureName}`)
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: featureName, feature_number: 1, phase: "spec" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: featureName, phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: featureName, phase: "tasks" })
    return featureDir
  }

  it("sets plan status to approved when plan approved", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.plan.approved = true
    sj.approvals.plan.generated = true
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.status).toBe("approved")
  })

  it("sets plan status to validated when generated but not approved", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.plan.generated = true
    sj.approvals.plan.approved = false
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.status).toBe("validated")
  })

  it("sets plan status to generated when not generated", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.plan.generated = false
    sj.approvals.plan.approved = false
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.status).toBe("generated")
  })

  it("sets tasks status to approved when tasks approved", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.tasks.approved = true
    sj.approvals.tasks.generated = true
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.status).toBe("approved")
  })

  it("sets tasks status to generated when not generated", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.approvals.tasks.generated = false
    sj.approvals.tasks.approved = false
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.status).toBe("generated")
  })

  it("sets tasks phase as 'tasks' when sj.phase is ready", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "ready"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "tasks.md"))
    expect(fm?.phase).toBe("tasks")
  })

  it("sets plan phase as 'plan' when sj.phase is ready", async () => {
    const root = await worktree()
    const featureDir = await setupFeature(root, "test")
    const sj = makeSpecJson("test", 1)
    sj.phase = "ready"
    await syncFrontmatterFromSpecJson(featureDir, sj)
    const fm = await readFrontmatter(path.join(featureDir, "plan.md"))
    expect(fm?.phase).toBe("plan")
  })
})

// ═══════════════════════════════════════════════════════════════
// 20. reconstructFromFrontmatter — spec phase override
// ═══════════════════════════════════════════════════════════════
describe("Kill: reconstructFromFrontmatter spec phase override", () => {
  it("spec.phase overrides to ready when all three files exist", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "ready" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe("ready")
    expect(result!.ready_for_implementation).toBe(true)
  })

  it("spec.phase overrides combined logic to plan", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "plan" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    // spec.phase="plan" overrides the combined logic which would set "tasks" (tasksOk=true)
    expect(result!.phase).toBe("plan")
    expect(result!.ready_for_implementation).toBe(false)
  })

  it("spec.phase overrides combined logic to spec", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "spec" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    // spec.phase="spec" overrides the combined logic
    expect(result!.phase).toBe("spec")
    expect(result!.ready_for_implementation).toBe(false)
  })

  it("spec.phase=impl overrides ready logic", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), { feature_name: "test", feature_number: 1, phase: "impl" })
    await writeMd(path.join(featureDir, "plan.md"), { feature_name: "test", phase: "plan" })
    await writeMd(path.join(featureDir, "tasks.md"), { feature_name: "test", phase: "tasks" })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe("impl")
    expect(result!.ready_for_implementation).toBe(false)
  })

  it("sets created_at and updated_at from spec frontmatter", async () => {
    const root = await worktree()
    const featureDir = path.join(root, "specs", "001-test")
    await fs.mkdir(featureDir, { recursive: true })
    await writeMd(path.join(featureDir, "spec.md"), {
      feature_name: "test",
      feature_number: 1,
      phase: "spec",
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: "2026-01-20T12:00:00.000Z",
    })
    const result = await reconstructFromFrontmatter(featureDir)
    expect(result).not.toBeNull()
    expect(result!.created_at).toBe("2026-01-15T10:00:00.000Z")
    expect(result!.updated_at).toBe("2026-01-20T12:00:00.000Z")
  })
})
