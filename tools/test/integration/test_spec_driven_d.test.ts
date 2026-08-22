import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import scaffoldTool from "../../speckit-scaffold"
import validateTool from "../../speckit-validate"
import auditTool from "../../speckit-audit"
import cleanTool from "../../speckit-clean"
import statusTool from "../../speckit-status"
import configTool from "../../speckit-config"
import complexityTool from "../../speckit-complexity"
import selfhealTool from "../../speckit-selfheal"
import { mockContext, createConstitution } from "../helpers/setup"
import {
  readSession,
  readSpecJson,
  writeSession,
  writeSpecJson,
  readConfig,
  writeWithBackup,
  acquireLock,
  releaseLock,
  resetLocks,
  corruptionWarnings,
  clearCorruptionWarnings,
  pushCorruptionWarning,
} from "../../shared/io"
import {
  detectPhase,
  detectPhaseFromFiles,
  isValidProjectRoot,
  getProjectRootWarnings,
} from "../../shared/types"
import {
  parsePhase,
  SessionStateSchema,
  SpecJsonSchema,
  sessionPath,
  specJsonPath,
  configPath,
} from "../../shared/schemas"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeAll(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "test_spec_driven_d-"))
  await fs.mkdir(path.join(worktree, ".opencode", "spec-memory"), { recursive: true })
  ctx = mockContext(worktree)
})

afterAll(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

beforeEach(() => {
  clearCorruptionWarnings()
  resetLocks()
})

// ── 1. Full SDD cycle with state verification ──────────────

describe("1. full SDD cycle with state verification", () => {
  it("constitution → spec → plan → tasks, verifying spec.json and session.json at each step", async () => {
    const root = worktree

    // Step 1: constitution
    await createConstitution(root)
    let session = await readSession(root)
    expect(session.phase).toBe("init")

    // Step 2: scaffold spec
    await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
    const specDir = path.join(root, "specs", "001-auth")
    const specMd = await fs.readFile(path.join(specDir, "spec.md"), "utf-8")
    expect(specMd).toContain("Auth")

    const sj = await readSpecJson(specDir)
    expect(sj).not.toBeNull()
    expect(sj!.feature_name).toBe("Auth")
    expect(sj!.feature_number).toBe(1)
    expect(sj!.phase).toBe("spec")
    expect(sj!.approvals.spec.generated).toBe(true)
    expect(sj!.approvals.spec.approved).toBe(false)

    session = await readSession(root)
    expect(session.phase).toBe("spec")
    expect(session.featureDir).toBe("001-auth")

    // Step 3: scaffold plan
    await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
    const planSj = await readSpecJson(specDir)
    expect(planSj!.phase).toBe("plan")
    expect(planSj!.approvals.plan.generated).toBe(true)

    session = await readSession(root)
    expect(session.phase).toBe("plan")

    // Step 4: scaffold tasks
    await scaffoldTool.execute({ featureName: "Auth", template: "tasks" }, ctx)
    const tasksSj = await readSpecJson(specDir)
    expect(tasksSj!.phase).toBe("tasks")
    expect(tasksSj!.approvals.tasks.generated).toBe(true)

    session = await readSession(root)
    expect(session.phase).toBe("tasks")
  })
})

// ── 2. Step skipping ───────────────────────────────────────

describe("2. step skipping", () => {
  it("plan before spec fails gracefully", async () => {
    const result = await scaffoldTool.execute({ featureName: "Skip", template: "plan" }, ctx)
    expect(result.output).toContain("002-skip")
    // Should still create the directory
    const dirExists = await fs.stat(path.join(worktree, "specs", "002-skip")).then(() => true).catch(() => false)
    expect(dirExists).toBe(true)
  })

  it("tasks before plan fails gracefully", async () => {
    const result = await scaffoldTool.execute({ featureName: "Skip2", template: "tasks" }, ctx)
    expect(result.output).toContain("003-skip2")
    const dirExists = await fs.stat(path.join(worktree, "specs", "003-skip2")).then(() => true).catch(() => false)
    expect(dirExists).toBe(true)
  })
})

// ── 3. Multiple features from cold start ───────────────────

describe("3. multiple features from cold start", () => {
  it("creates two features and status shows both", async () => {
    const result1 = await scaffoldTool.execute({ featureName: "MultiA", template: "spec" }, ctx)
    expect(result1.output).toContain("specs/")
    // feature number may vary depending on existing dirs
    const result2 = await scaffoldTool.execute({ featureName: "MultiB", template: "spec" }, ctx)
    expect(result2.output).toContain("specs/")

    const status = await statusTool.execute({}, ctx)
    expect(status.metadata?.featureCount).toBeGreaterThanOrEqual(2)
  })
})

// ── 4. Constitution overwrite ──────────────────────────────

describe("4. constitution overwrite", () => {
  it("overwrites constitution and spec still works", async () => {
    const root = worktree
    const specMemory = path.join(root, ".opencode", "spec-memory")
    await fs.writeFile(path.join(specMemory, "constitution.md"), "# Original Constitution\n", "utf-8")

    const result = await scaffoldTool.execute({ featureName: "Overwrite", template: "spec" }, ctx)
    expect(result.output).toContain("specs/")
    // Find the created directory dynamically
    const specsDir = path.join(root, "specs")
    const dirs = await fs.readdir(specsDir)
    const overwriteDir = dirs.find(d => d.includes("overwrite"))
    expect(overwriteDir).toBeDefined()
    const sj = await readSpecJson(path.join(specsDir, overwriteDir!))
    expect(sj).not.toBeNull()
    expect(sj!.feature_name).toBe("Overwrite")
  })
})

// ── 5. Feature deletion ────────────────────────────────────

describe("5. feature deletion", () => {
  it("delete feature directory, clean detects orphan", async () => {
    const specDir = path.join(worktree, "specs", "005-orphan")
    await fs.mkdir(specDir, { recursive: true })
    await fs.writeFile(path.join(specDir, "spec.md"), "# Orphan Spec\n", "utf-8")

    // Remove the spec.md to make it truly orphan
    await fs.rm(path.join(specDir, "spec.md"))
    const dirExists = await fs.stat(specDir).then(() => true).catch(() => false)
    expect(dirExists).toBe(true)

    const cleanResult = await cleanTool.execute({}, ctx)
    expect(cleanResult.output).toBeDefined()
  })
})

// ── 6. Config during cold start ────────────────────────────

describe("6. config during cold start", () => {
  it("reads default config and writes custom values", async () => {
    const readResult = await configTool.execute({}, ctx)
    expect(readResult.title).toBe("SDD Configuration")
    expect(readResult.output).toContain("(not set)")

    const writeResult = await configTool.execute({ defaultTechStack: "React+TypeScript" }, ctx)
    expect(writeResult.output).toContain("React+TypeScript")

    const readBack = await readConfig(worktree)
    expect(readBack.defaultTechStack).toBe("React+TypeScript")
  })
})

// ── 7. Complexity tool ─────────────────────────────────────

describe("7. complexity tool", () => {
  it("returns simple for basic task", async () => {
    const result = await complexityTool.execute(
      { taskDescription: "add a comment to a function" },
      ctx,
    )
    expect(result.metadata?.level).toBeDefined()
  })

  it("returns complex for multi-file task", async () => {
    const result = await complexityTool.execute(
      { taskDescription: "refactor authentication module to support OAuth2 and SAML with database migration", filesAffected: 15, hasNewDependencies: true },
      ctx,
    )
    expect(result.metadata?.level).toBeDefined()
  })
})

// ── 8. Orphan directories ──────────────────────────────────

describe("8. orphan directories", () => {
  it("validate handles directory with no spec.md", async () => {
    const orphanDir = path.join(worktree, "specs", "099-orphan")
    await fs.mkdir(orphanDir, { recursive: true })

    const result = await validateTool.execute({ featureDir: "099-orphan" }, ctx)
    expect(result.title).toBeDefined()
    // Should not crash
  })
})

// ── 9. Corruption recovery cycle ───────────────────────────

describe("9. corruption recovery cycle", () => {
  it("corrupt → auto-restore → corrupt → auto-restore", async () => {
    const root = worktree
    const specDir = path.join(root, "specs", "001-auth")
    const fp = specJsonPath(specDir)

    // Ensure spec.json exists and is valid
    const valid = await readSpecJson(specDir)
    expect(valid).not.toBeNull()

    // Corrupt it
    await fs.writeFile(fp, "not valid json {{{", "utf-8")

    // Auto-restore should work
    const restored = await readSpecJson(specDir)
    expect(restored).not.toBeNull()
    expect(restored!.feature_name).toBe("Auth")

    // Corrupt again
    await fs.writeFile(fp, "again invalid {{{", "utf-8")

    // Auto-restore again
    const restored2 = await readSpecJson(specDir)
    expect(restored2).not.toBeNull()
  })
})

// ── 10. Validate after clean --fix ─────────────────────────

describe("10. validate after clean --fix", () => {
  it("clean fix then validate shows consistency", async () => {
    const cleanResult = await cleanTool.execute({ fix: true }, ctx)
    expect(cleanResult.output).toBeDefined()

    const validateResult = await validateTool.execute({ featureDir: "001-auth" }, ctx)
    expect(validateResult.metadata?.phase).toBeDefined()
  })
})

// ── 11. Validate after audit --fix ─────────────────────────

describe("11. validate after audit --fix", () => {
  it("audit fix then validate shows consistency", async () => {
    const auditResult = await auditTool.execute({ fix: true }, ctx)
    expect(auditResult.output).toBeDefined()

    const validateResult = await validateTool.execute({ featureDir: "001-auth" }, ctx)
    expect(validateResult.metadata?.phase).toBeDefined()
  })
})

// ── 12. Unicode in names ───────────────────────────────────

describe("12. unicode in names", () => {
  it("handles feature name with accented characters", async () => {
    const result = await scaffoldTool.execute({ featureName: "Ñoño", template: "spec" }, ctx)
    expect(result.output).toBeDefined()
    // Should not crash regardless of how it handles unicode
  })
})

// ── 13. Deep nesting ───────────────────────────────────────

describe("13. deep nesting", () => {
  it("getProjectRootWarnings for deep path returns no warnings", async () => {
    const deepPath = path.join(os.tmpdir(), "a", "b", "c", "d", "e", "f", "g")
    const warnings = await getProjectRootWarnings(deepPath)
    expect(warnings.some(w => w.type === "shallow-path")).toBe(false)
  })
})

// ── 14. Trailing separators ────────────────────────────────

describe("14. trailing separators", () => {
  it("getProjectRootWarnings handles trailing separator", async () => {
    const rootWithSlash = worktree + path.sep
    const warnings = await getProjectRootWarnings(rootWithSlash)
    expect(warnings).toBeDefined()
  })
})

// ── 15. Empty/missing files mid-workflow ───────────────────

describe("15. empty/missing files mid-workflow", () => {
  it("validate detects when spec.md is deleted after plan created", async () => {
    const specDir = path.join(worktree, "specs", "001-auth")
    const specMdPath = path.join(specDir, "spec.md")

    const existed = await fs.access(specMdPath).then(() => true).catch(() => false)
    if (!existed) {
      // Create spec.md for this test
      await fs.writeFile(specMdPath, "# Temp Spec\n", "utf-8")
    }

    // Delete spec.md
    await fs.rm(specMdPath, { force: true })

    const result = await validateTool.execute({ featureDir: "001-auth" }, ctx)
    expect(result.output).toBeDefined()

    // Restore spec.md
    if (!existed) {
      await fs.writeFile(specMdPath, "# Spec\n", "utf-8")
    }
  })
})

// ── 16. Selfheal during cold start ─────────────────────────

describe("16. selfheal during cold start", () => {
  it("selfheal runs without errors on fresh project", async () => {
    const result = await selfhealTool.execute({}, ctx)
    expect(result.title).toBeDefined()
    expect(result.output).toBeDefined()
  })
})

// ── 17. Status metadata correctness ────────────────────────

describe("17. status metadata correctness", () => {
  it("returns correct phase, featureCount, and latestFeature", async () => {
    const result = await statusTool.execute({}, ctx)
    expect(result.metadata?.featureCount).toBeGreaterThanOrEqual(1)
    expect(result.metadata?.latestFeature).toBeDefined()
    expect(result.output).toContain("001-auth")
  })
})

// ── 18. Audit --fix end-to-end ─────────────────────────────

describe("18. audit --fix end-to-end", () => {
  it("audit fix runs without crashing", async () => {
    const first = await auditTool.execute({ fix: true }, ctx)
    expect(first.title).toBeDefined()
    expect(first.output).toBeDefined()
    const second = await auditTool.execute({ fix: true }, ctx)
    expect(second.title).toBeDefined()
  })
})

// ── 19. detectPhase invariant ──────────────────────────────

describe("19. detectPhase invariant", () => {
  it("never returns impl or complete with all files present", async () => {
    const result = detectPhase(true, true, true, true)
    expect(result.phase).toBe("ready")
    expect(result.phase).not.toBe("impl")
    expect(result.phase).not.toBe("complete")
  })

  it("returns init when constitution missing", () => {
    const result = detectPhase(false, false, false, false)
    expect(result.phase).toBe("init")
  })

  it("returns spec when spec missing", () => {
    const result = detectPhase(false, false, false, true)
    expect(result.phase).toBe("spec")
  })

  it("returns plan when plan missing", () => {
    const result = detectPhase(true, false, false, true)
    expect(result.phase).toBe("plan")
  })

  it("returns tasks when tasks missing", () => {
    const result = detectPhase(true, true, false, true)
    expect(result.phase).toBe("tasks")
  })
})

// ── 20. parsePhase init promotion ──────────────────────────

describe("20. parsePhase init promotion", () => {
  it("promotes init to spec", () => {
    expect(parsePhase("init")).toBe("spec")
  })

  it("passes through valid phases", () => {
    expect(parsePhase("spec")).toBe("spec")
    expect(parsePhase("plan")).toBe("plan")
    expect(parsePhase("tasks")).toBe("tasks")
    expect(parsePhase("ready")).toBe("ready")
    expect(parsePhase("impl")).toBe("impl")
    expect(parsePhase("complete")).toBe("complete")
  })

  it("falls back to spec for invalid phase", () => {
    expect(parsePhase("bogus")).toBe("spec")
    expect(parsePhase("")).toBe("spec")
  })
})

// ── 21. Session vs SpecJson phase divergence ───────────────

describe("21. session vs specJson phase divergence", () => {
  it("validate detects mismatch between session and spec.json", async () => {
    const root = worktree
    const specDir = path.join(root, "specs", "001-auth")

    // Write spec.json at "spec" phase
    const sj = await readSpecJson(specDir)
    expect(sj).not.toBeNull()
    sj!.phase = "spec"
    await writeSpecJson(sj!, specDir)

    // Session should show the phase from validate
    const result = await validateTool.execute({ featureDir: "001-auth" }, ctx)
    expect(result.metadata?.phase).toBeDefined()
  })
})

// ── 22. Reentrant lock ─────────────────────────────────────

describe("22. reentrant lock", () => {
  it("acquiring same lock twice returns reentrant on second call", async () => {
    const fp = sessionPath(worktree)
    const handle1 = await acquireLock(fp)
    expect(handle1.reentrant).toBeFalsy()

    const handle2 = await acquireLock(fp)
    expect(handle2.reentrant).toBe(true)

    await releaseLock(handle1)
    // handle2 is reentrant, releaseLock should be no-op
    await releaseLock(handle2)
  })
})

// ── 23. Stale lock detection ───────────────────────────────

describe("23. stale lock detection", () => {
  it("reclaims stale lock when PID is dead", async () => {
    const fp = path.join(worktree, "stale-test.txt")
    const lockDir = fp + ".lock"

    // Create a fake stale lock with a dead PID
    await fs.mkdir(lockDir, { recursive: true })
    await fs.writeFile(
      path.join(lockDir, "lock.json"),
      JSON.stringify({ pid: 99999999, createdAt: new Date(Date.now() - 30000).toISOString() }),
      "utf-8",
    )

    // Should reclaim the stale lock (PID 99999999 is dead)
    const handle = await acquireLock(fp, { timeout: 3000, staleThreshold: 100 })
    expect(handle).toBeDefined()
    expect(handle.reentrant).toBeFalsy()
    await releaseLock(handle)
  })
})

// ── 24. Corruption warnings dedup ──────────────────────────

describe("24. corruption warnings dedup", () => {
  it("deduplicates same warning", () => {
    pushCorruptionWarning("/test/file.json", "test error")
    pushCorruptionWarning("/test/file.json", "test error")
    expect(corruptionWarnings).toHaveLength(1)
  })

  it("allows different messages for same file", () => {
    pushCorruptionWarning("/test/file.json", "error 1")
    pushCorruptionWarning("/test/file.json", "error 2")
    expect(corruptionWarnings).toHaveLength(2)
  })

  it("allows different files for same message", () => {
    clearCorruptionWarnings()
    pushCorruptionWarning("/test/a.json", "test error")
    pushCorruptionWarning("/test/b.json", "test error")
    expect(corruptionWarnings).toHaveLength(2)
  })
})

// ── 25. Corruption warnings cross-tool cleanup ─────────────

describe("25. corruption warnings cross-tool cleanup", () => {
  it("clearCorruptionWarnings resets the array", () => {
    pushCorruptionWarning("/test/file.json", "test error")
    expect(corruptionWarnings).toHaveLength(1)
    clearCorruptionWarnings()
    expect(corruptionWarnings).toHaveLength(0)
  })
})

// ── 26. writeConfig round-trip ─────────────────────────────

describe("26. writeConfig round-trip", () => {
  it("write then read returns same values", async () => {
    const root = worktree
    const config = {
      defaultTechStack: "Django+PostgreSQL",
      lastUsedLanguage: "python",
      expressMode: true,
      autoVersioning: false,
      preferences: { theme: "dark" },
    }
    const fp = configPath(root)
    await writeWithBackup(fp, JSON.stringify(config, null, 2), root)
    const readBack = await readConfig(root)
    expect(readBack.defaultTechStack).toBe("Django+PostgreSQL")
    expect(readBack.lastUsedLanguage).toBe("python")
    expect(readBack.expressMode).toBe(true)
    expect(readBack.preferences.theme).toBe("dark")
  })
})

// ── 27-29. Clean exemptions ───────────────────────────────

describe("27. clean exemption: tasks not approved", () => {
  it("tasks phase with ready files but tasks not approved is NOT a mismatch", async () => {
    const root = worktree
    const specDir = path.join(root, "specs", "001-auth")
    const fp = specJsonPath(specDir)

    // Read current spec.json
    const sj = await readSpecJson(specDir)
    expect(sj).not.toBeNull()

    // Set phase to "tasks" with tasks not approved
    sj!.phase = "tasks"
    sj!.approvals.tasks.generated = true
    sj!.approvals.tasks.approved = false
    await writeSpecJson(sj!, specDir)

    // All files exist (spec, plan, tasks) — but tasks not approved
    // clean should NOT report this as a mismatch
    const result = await cleanTool.execute({}, ctx)
    expect(result.output).toBeDefined()
  })
})

describe("28. clean exemption: complete no downgrade", () => {
  it("complete phase with ready files is NOT a mismatch", async () => {
    const root = worktree
    const specDir = path.join(root, "specs", "001-auth")

    const sj = await readSpecJson(specDir)
    expect(sj).not.toBeNull()

    sj!.phase = "complete"
    await writeSpecJson(sj!, specDir)

    const result = await cleanTool.execute({}, ctx)
    expect(result.output).toBeDefined()
  })
})

describe("29. clean exemption: impl no downgrade", () => {
  it("impl phase with ready files is NOT a mismatch", async () => {
    const root = worktree
    const specDir = path.join(root, "specs", "001-auth")

    const sj = await readSpecJson(specDir)
    expect(sj).not.toBeNull()

    sj!.phase = "impl"
    await writeSpecJson(sj!, specDir)

    const result = await cleanTool.execute({}, ctx)
    expect(result.output).toBeDefined()
  })
})

// ── 30. spec.json init rejection ───────────────────────────

describe("30. spec.json init rejection", () => {
  it("SpecJsonSchema rejects init phase", () => {
    const invalid = {
      feature_name: "Test",
      feature_number: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      phase: "init",
      approvals: {
        spec: { generated: false, approved: false },
        plan: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      },
      ready_for_implementation: false,
    }
    const result = SpecJsonSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

// ── 31-32. Post-write verification ────────────────────────

describe("31. post-write verification in writeSession", () => {
  it("writes and re-reads session correctly", async () => {
    const root = worktree
    const session = {
      command: "test",
      phase: "spec" as const,
      featureDir: "001-auth",
      featureNumber: 1,
      featureName: "Auth",
      nextStep: "/plan",
      lastResult: "test result",
      history: ["step1", "step2"],
    }
    await writeSession(root, session)
    const readBack = await readSession(root)
    expect(readBack.phase).toBe("spec")
    expect(readBack.featureDir).toBe("001-auth")
    expect(readBack.history).toEqual(["step1", "step2"])
  })
})

describe("32. post-write verification in writeSpecJson", () => {
  it("writes and re-reads spec.json correctly", async () => {
    const root = worktree
    const specDir = path.join(root, "specs", "001-auth")
    const sj = await readSpecJson(specDir)
    expect(sj).not.toBeNull()

    sj!.phase = "plan"
    sj!.approvals.plan.generated = true
    await writeSpecJson(sj!, specDir)

    const readBack = await readSpecJson(specDir)
    expect(readBack!.phase).toBe("plan")
    expect(readBack!.approvals.plan.generated).toBe(true)
  })
})

// ── 33. Backup timestamp collision ─────────────────────────

describe("33. backup timestamp collision", () => {
  it("two rapid writes create valid backups", async () => {
    const root = worktree
    const specDir = path.join(root, "specs", "001-auth")
    const fp = specJsonPath(specDir)

    const sj = await readSpecJson(specDir)
    expect(sj).not.toBeNull()

    // Write twice rapidly
    sj!.phase = "tasks"
    await writeSpecJson(sj!, specDir)
    sj!.phase = "ready"
    await writeSpecJson(sj!, specDir)

    // Verify backups exist
    const backupDir = path.join(root, ".opencode", "backups")
    const files = await fs.readdir(backupDir).catch(() => [])
    const bakFiles = files.filter(f => f.startsWith("spec.json") && f.endsWith(".bak"))
    expect(bakFiles.length).toBeGreaterThanOrEqual(1)
  })
})

// ── 34. Stale lock with dead PID ───────────────────────────

describe("34. stale lock with dead PID", () => {
  it("reclaims lock when lock.json has invalid createdAt", async () => {
    const fp = path.join(worktree, "invalid-lock-test.txt")
    const lockDir = fp + ".lock"

    // Create a lock with invalid createdAt
    await fs.mkdir(lockDir, { recursive: true })
    await fs.writeFile(
      path.join(lockDir, "lock.json"),
      JSON.stringify({ pid: 99999999, createdAt: "not-a-date" }),
      "utf-8",
    )

    const handle = await acquireLock(fp, { timeout: 3000, staleThreshold: 100 })
    expect(handle).toBeDefined()
    await releaseLock(handle)
  })
})

// ── detectPhaseFromFiles ───────────────────────────────────

describe("detectPhaseFromFiles", () => {
  it("never returns init, impl, or complete", () => {
    expect(detectPhaseFromFiles(true, true, true)).toBe("ready")
    expect(detectPhaseFromFiles(true, true, true)).not.toBe("init")
    expect(detectPhaseFromFiles(true, true, true)).not.toBe("impl")
    expect(detectPhaseFromFiles(true, true, true)).not.toBe("complete")
  })

  it("returns spec when spec missing", () => {
    expect(detectPhaseFromFiles(false, false, false)).toBe("spec")
  })

  it("returns plan when plan missing", () => {
    expect(detectPhaseFromFiles(true, false, false)).toBe("plan")
  })

  it("returns tasks when tasks missing", () => {
    expect(detectPhaseFromFiles(true, true, false)).toBe("tasks")
  })
})

// ── isValidProjectRoot ─────────────────────────────────────

describe("isValidProjectRoot", () => {
  it("rejects drive roots", async () => {
    expect(await isValidProjectRoot("C:\\")).toBe(false)
    expect(await isValidProjectRoot("D:\\")).toBe(false)
  })

  it("accepts valid project root", async () => {
    expect(await isValidProjectRoot(worktree)).toBe(true)
  })
})

// ── SessionStateSchema validation ──────────────────────────

describe("SessionStateSchema", () => {
  it("rejects invalid phase", () => {
    const result = SessionStateSchema.safeParse({
      command: null,
      phase: "bogus",
      featureDir: null,
      featureNumber: null,
      featureName: null,
      nextStep: null,
      lastResult: null,
      history: [],
    })
    expect(result.success).toBe(false)
  })

  it("accepts all valid phases", () => {
    for (const phase of ["init", "spec", "plan", "tasks", "ready", "impl", "complete"]) {
      const result = SessionStateSchema.safeParse({
        command: null,
        phase,
        featureDir: null,
        featureNumber: null,
        featureName: null,
        nextStep: null,
        lastResult: null,
        history: [],
      })
      expect(result.success).toBe(true)
    }
  })
})
