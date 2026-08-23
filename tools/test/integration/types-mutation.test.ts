import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  parseNNN,
  detectPhase,
  detectPhaseFromFiles,
  isValidProjectRoot,
  getProjectRootWarnings,
  detectParentProjectWithoutSession,
  parsePhase,
  makeSpecJson,
  makeDeltaIndex,
  getNextDeltaId,
  makeDelta,
  assessComplexity,
  detectPackageManager,
  detectFramework,
  detectConfigFiles,
  discoverProject,
  getFeatureDirs,
  getLatestFeatureDir,
  specsDirPath,
} from "../../shared/types"

let tmp: string

async function worktree(): Promise<string> {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "types-mutation-"))
  return tmp
}

beforeEach(async () => {})

afterEach(async () => {
  if (tmp) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

describe("Phase 5: Types Module - Mutation Score Improvement", () => {

  describe("5.1 isValidProjectRoot", () => {
    it("returns false for drive root on Windows", async () => {
      expect(await isValidProjectRoot("C:\\")).toBe(false)
      expect(await isValidProjectRoot("D:")).toBe(false)
    })

    it("returns false when spec-memory directory does not exist", async () => {
      const root = await worktree()
      expect(await isValidProjectRoot(root)).toBe(false)
    })

    it("returns true when spec-memory directory exists", async () => {
      const root = await worktree()
      await fs.mkdir(path.join(root, ".opencode", "spec-memory"), { recursive: true })
      expect(await isValidProjectRoot(root)).toBe(true)
    })

    it("returns false when spec-memory is a symlink", async () => {
      if (os.platform() === "win32") return
      const root = await worktree()
      const realDir = await fs.mkdtemp(path.join(os.tmpdir(), "real-"))
      await fs.mkdir(path.join(realDir, ".opencode", "spec-memory"), { recursive: true })
      await fs.mkdir(path.join(root, ".opencode"), { recursive: true })
      await fs.symlink(path.join(realDir, ".opencode", "spec-memory"), path.join(root, ".opencode", "spec-memory"))
      expect(await isValidProjectRoot(root)).toBe(false)
    })

    it("returns false for nonexistent path", async () => {
      expect(await isValidProjectRoot("/nonexistent/path/xyz")).toBe(false)
    })
  })

  describe("5.2 getProjectRootWarnings", () => {
    it("returns kit-installation warning when running from kit dir", async () => {
      const homeDir = os.homedir()
      const kitDir = path.join(homeDir, ".config", "opencode")
      const warnings = await getProjectRootWarnings(kitDir)
      expect(warnings.some(w => w.type === "kit-installation")).toBe(true)
    })

    it("returns shallow-path warning on Windows for short paths", async () => {
      if (os.platform() === "win32") {
        const warnings = await getProjectRootWarnings("C:\\a")
        expect(warnings.some(w => w.type === "shallow-path")).toBe(true)
      }
    })

    it("returns system-directory warning for system dirs", async () => {
      const warnings = await getProjectRootWarnings("/usr")
      expect(warnings.some(w => w.type === "system-directory")).toBe(true)
    })

    it("returns no warnings for a normal project path", async () => {
      const root = await worktree()
      const warnings = await getProjectRootWarnings(root)
      expect(warnings).toHaveLength(0)
    })

    it("returns empty for drive root", async () => {
      const warnings = await getProjectRootWarnings("C:\\")
      expect(warnings).toHaveLength(0)
    })
  })

  describe("5.3 detectParentProjectWithoutSession", () => {
    it("returns null when no parent project exists", async () => {
      const root = await worktree()
      const result = await detectParentProjectWithoutSession(root)
      expect(result).toBeNull()
    })

    it("returns parent path when parent has spec-memory but no session", async () => {
      const root = await worktree()
      const child = path.join(root, "child")
      await fs.mkdir(path.join(child, ".opencode", "spec-memory"), { recursive: true })
      await fs.mkdir(path.join(root, ".opencode", "spec-memory"), { recursive: true })
      const result = await detectParentProjectWithoutSession(child)
      expect(result).toBe(root)
    })

    it("returns null when parent has session file", async () => {
      const root = await worktree()
      const child = path.join(root, "child")
      await fs.mkdir(path.join(child, ".opencode", "spec-memory"), { recursive: true })
      await fs.mkdir(path.join(root, ".opencode", "spec-memory"), { recursive: true })
      await fs.writeFile(path.join(root, ".opencode", "spec-memory", "session.json"), "{}")
      const result = await detectParentProjectWithoutSession(child)
      expect(result).toBeNull()
    })
  })

  describe("5.4 detectPhase edge cases", () => {
    it("returns init when constitution missing regardless of files", () => {
      expect(detectPhase(true, true, true, false).phase).toBe("init")
    })

    it("returns spec when only constitution exists", () => {
      expect(detectPhase(false, false, false, true).phase).toBe("spec")
    })

    it("returns plan when constitution and spec exist", () => {
      expect(detectPhase(true, false, false, true).phase).toBe("plan")
    })

    it("returns tasks when constitution, spec, and plan exist", () => {
      expect(detectPhase(true, true, false, true).phase).toBe("tasks")
    })

    it("returns ready when all four conditions met", () => {
      expect(detectPhase(true, true, true, true).phase).toBe("ready")
    })

    it("returns correct nextStep for each phase", () => {
      expect(detectPhase(false, false, false, false).nextStep).toContain("/spec")
      expect(detectPhase(false, false, false, true).nextStep).toContain("/spec")
      expect(detectPhase(true, false, false, true).nextStep).toContain("/plan")
      expect(detectPhase(true, true, false, true).nextStep).toContain("/tasks")
      expect(detectPhase(true, true, true, true).nextStep).toContain("/impl")
    })
  })

  describe("5.5 detectPhaseFromFiles edge cases", () => {
    it("returns spec when only spec missing", () => {
      expect(detectPhaseFromFiles(false, true, true)).toBe("spec")
    })

    it("returns plan when only plan missing", () => {
      expect(detectPhaseFromFiles(true, false, true)).toBe("plan")
    })

    it("returns tasks when only tasks missing", () => {
      expect(detectPhaseFromFiles(true, true, false)).toBe("tasks")
    })

    it("returns ready when all present", () => {
      expect(detectPhaseFromFiles(true, true, true)).toBe("ready")
    })

    it("returns spec when all missing", () => {
      expect(detectPhaseFromFiles(false, false, false)).toBe("spec")
    })
  })

  describe("5.6 parsePhase", () => {
    it("parses valid phases", () => {
      expect(parsePhase("spec")).toBe("spec")
      expect(parsePhase("plan")).toBe("plan")
      expect(parsePhase("tasks")).toBe("tasks")
      expect(parsePhase("ready")).toBe("ready")
      expect(parsePhase("impl")).toBe("impl")
      expect(parsePhase("complete")).toBe("complete")
    })

    it("returns spec for invalid phase", () => {
      expect(parsePhase("bogus")).toBe("spec")
      expect(parsePhase("")).toBe("spec")
      expect(parsePhase("INIT")).toBe("spec")
    })

    it("maps init to spec", () => {
      expect(parsePhase("init")).toBe("spec")
    })
  })

  describe("5.7 detectPackageManager", () => {
    it("detects npm from package-lock.json", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "package-lock.json"), "{}")
      expect(await detectPackageManager(root)).toBe("npm")
    })

    it("detects yarn from yarn.lock", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "yarn.lock"), "")
      expect(await detectPackageManager(root)).toBe("yarn")
    })

    it("detects pnpm from pnpm-lock.yaml", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "")
      expect(await detectPackageManager(root)).toBe("pnpm")
    })

    it("detects bun from bun.lockb", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "bun.lockb"), "")
      expect(await detectPackageManager(root)).toBe("bun")
    })

    it("returns unknown when no lock file found", async () => {
      const root = await worktree()
      expect(await detectPackageManager(root)).toBe("unknown")
    })
  })

  describe("5.8 detectFramework", () => {
    it("returns null for empty dependencies", async () => {
      const root = await worktree()
      expect(await detectFramework(root, [])).toBeNull()
    })

    it("detects react", async () => {
      const root = await worktree()
      expect(await detectFramework(root, ["react", "react-dom"])).toBe("react")
    })

    it("detects next", async () => {
      const root = await worktree()
      expect(await detectFramework(root, ["next"])).toBe("next")
    })

    it("detects vue", async () => {
      const root = await worktree()
      expect(await detectFramework(root, ["vue", "vue-router"])).toBe("vue")
    })

    it("detects svelte", async () => {
      const root = await worktree()
      expect(await detectFramework(root, ["@sveltejs/kit"])).toBe("svelte")
    })

    it("returns null for unknown dependencies", async () => {
      const root = await worktree()
      expect(await detectFramework(root, ["lodash", "axios"])).toBeNull()
    })

    it("detects first matching framework", async () => {
      const root = await worktree()
      expect(await detectFramework(root, ["next", "react"])).toBe("next")
    })
  })

  describe("5.9 discoverProject", () => {
    it("returns default context for empty directory", async () => {
      const root = await worktree()
      const ctx = await discoverProject(root)
      expect(ctx.packageManager).toBe("unknown")
      expect(ctx.framework).toBeNull()
      expect(ctx.hasTypeScript).toBe(false)
      expect(ctx.hasESLint).toBe(false)
      expect(ctx.hasTestingFramework).toBe(false)
      expect(ctx.topLevelDirs).toEqual([])
    })

    it("detects TypeScript from package.json dependency", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
        dependencies: { typescript: "^5.0.0" },
      }))
      const ctx = await discoverProject(root)
      expect(ctx.hasTypeScript).toBe(true)
    })

    it("detects TypeScript from tsconfig.json", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "tsconfig.json"), "{}")
      const ctx = await discoverProject(root)
      expect(ctx.hasTypeScript).toBe(true)
    })

    it("detects ESLint from .eslintrc.js", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, ".eslintrc.js"), "module.exports = {}")
      const ctx = await discoverProject(root)
      expect(ctx.hasESLint).toBe(true)
    })

    it("detects testing framework from devDependencies", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
        devDependencies: { vitest: "^1.0.0" },
      }))
      const ctx = await discoverProject(root)
      expect(ctx.hasTestingFramework).toBe(true)
    })

    it("detects testing framework from dependencies", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
        dependencies: { jest: "^29.0.0" },
      }))
      const ctx = await discoverProject(root)
      expect(ctx.hasTestingFramework).toBe(true)
    })

    it("filters dotfiles and node_modules from topLevelDirs", async () => {
      const root = await worktree()
      await fs.mkdir(path.join(root, "src"))
      await fs.mkdir(path.join(root, "lib"))
      await fs.mkdir(path.join(root, ".git"))
      await fs.mkdir(path.join(root, "node_modules"))
      await fs.mkdir(path.join(root, ".vscode"))
      const ctx = await discoverProject(root)
      expect(ctx.topLevelDirs).toContain("src")
      expect(ctx.topLevelDirs).toContain("lib")
      expect(ctx.topLevelDirs).not.toContain(".git")
      expect(ctx.topLevelDirs).not.toContain("node_modules")
      expect(ctx.topLevelDirs).not.toContain(".vscode")
    })

    it("detects framework from dependencies", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
        dependencies: { react: "^18.0.0" },
      }))
      const ctx = await discoverProject(root)
      expect(ctx.framework).toBe("react")
    })

    it("detects npm package manager", async () => {
      const root = await worktree()
      await fs.writeFile(path.join(root, "package-lock.json"), "{}")
      const ctx = await discoverProject(root)
      expect(ctx.packageManager).toBe("npm")
    })
  })

  describe("5.10 assessComplexity edge cases", () => {
    it("returns simple for 1 file", async () => {
      const r = await assessComplexity("fix typo", 1, false, false, false)
      expect(r.level).toBe("simple")
      expect(r.score).toBeLessThanOrEqual(2)
    })

    it("returns simple for 2-3 files", async () => {
      const r = await assessComplexity("fix bug", 3, false, false, false)
      expect(r.level).toBe("simple")
      expect(r.score).toBeLessThanOrEqual(2)
    })

    it("returns standard for 4-8 files", async () => {
      const r = await assessComplexity("add feature", 4, false, false, false)
      expect(r.level).toBe("standard")
      expect(r.score).toBeGreaterThanOrEqual(3)
    })

    it("returns complex for 9+ files with other factors", async () => {
      const r = await assessComplexity("big change", 9, true, true, false)
      expect(r.level).toBe("complex")
      expect(r.score).toBeGreaterThanOrEqual(7)
    })

    it("adds score for new dependencies", async () => {
      const r1 = await assessComplexity("add feature", 1, false, false, false)
      const r2 = await assessComplexity("add feature", 1, true, false, false)
      expect(r2.score).toBeGreaterThan(r1.score)
    })

    it("adds score for boundary annotations", async () => {
      const r1 = await assessComplexity("add feature", 1, false, false, false)
      const r2 = await assessComplexity("add feature", 1, false, true, false)
      expect(r2.score).toBeGreaterThan(r1.score)
    })

    it("adds score for needs clarification", async () => {
      const r1 = await assessComplexity("add feature", 1, false, false, false)
      const r2 = await assessComplexity("add feature", 1, false, false, true)
      expect(r2.score).toBeGreaterThan(r1.score)
    })

    it("detects migration keyword", async () => {
      const r = await assessComplexity("database migration to postgres", 1, false, false, false)
      expect(r.score).toBeGreaterThanOrEqual(2)
    })

    it("detects refactor keyword", async () => {
      const r = await assessComplexity("refactor authentication module", 1, false, false, false)
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it("detects security keyword", async () => {
      const r = await assessComplexity("add security headers", 1, false, false, false)
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it("detects performance keyword", async () => {
      const r = await assessComplexity("optimize database performance", 1, false, false, false)
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it("detects API keyword", async () => {
      const r = await assessComplexity("add new REST endpoint", 1, false, false, false)
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it("detects concurrency keyword", async () => {
      const r = await assessComplexity("handle concurrent writes", 1, false, false, false)
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it("detects scraping keyword", async () => {
      const r = await assessComplexity("add web scraping module", 1, false, false, false)
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it("adds score for no framework with known package manager", async () => {
      const ctx = { packageManager: "npm" as const, framework: null, hasTypeScript: false, hasESLint: false, hasTestingFramework: false, configFiles: [], dependencies: [], devDependencies: [], scripts: [], topLevelDirs: [] }
      const r = await assessComplexity("add feature", 1, false, false, false, ctx)
      expect(r.score).toBeGreaterThanOrEqual(1)
    })

    it("does not add score for no framework with unknown package manager", async () => {
      const ctx = { packageManager: "unknown" as const, framework: null, hasTypeScript: false, hasESLint: false, hasTestingFramework: false, configFiles: [], dependencies: [], devDependencies: [], scripts: [], topLevelDirs: [] }
      const r = await assessComplexity("add feature", 1, false, false, false, ctx)
      const ctxWithFramework = { ...ctx, framework: "react" }
      const r2 = await assessComplexity("add feature", 1, false, false, false, ctxWithFramework)
      expect(r.score).toBeGreaterThanOrEqual(r2.score)
    })

    it("deduplicates keyword reasons", async () => {
      const r = await assessComplexity("migration and another migration task", 1, false, false, false)
      const migrationReasons = r.reasoning.filter(reason => reason.includes("migration task detected"))
      expect(migrationReasons).toHaveLength(1)
    })
  })

  describe("5.11 Delta utilities", () => {
    it("makeDeltaIndex creates empty index", () => {
      const idx = makeDeltaIndex("001-test")
      expect(idx.feature).toBe("001-test")
      expect(idx.deltas).toEqual([])
    })

    it("getNextDeltaId returns D001 for empty array", () => {
      expect(getNextDeltaId([])).toBe("D001")
    })

    it("getNextDeltaId returns next ID after existing deltas", () => {
      const deltas = [
        { id: "D001", type: "feature" as const, title: "a", status: "draft" as const, impact: "low" as const, parent_feature: "f", created_at: "", updated_at: "" },
        { id: "D003", type: "feature" as const, title: "b", status: "draft" as const, impact: "low" as const, parent_feature: "f", created_at: "", updated_at: "" },
      ]
      expect(getNextDeltaId(deltas)).toBe("D004")
    })

    it("makeDelta creates delta with draft status", () => {
      const d = makeDelta("D001", "feature", "Test", "medium", "001-test")
      expect(d.status).toBe("draft")
      expect(d.type).toBe("feature")
      expect(d.impact).toBe("medium")
      expect(d.id).toBe("D001")
    })

    it("makeDelta sets created_at and updated_at", () => {
      const before = Date.now()
      const d = makeDelta("D001", "feature", "Test", "low", "001-test")
      const after = Date.now()
      expect(new Date(d.created_at).getTime()).toBeGreaterThanOrEqual(before)
      expect(new Date(d.created_at).getTime()).toBeLessThanOrEqual(after)
    })
  })

  describe("5.12 Feature directory utilities", () => {
    it("getFeatureDirs returns empty for missing specs dir", async () => {
      const root = await worktree()
      const dirs = await getFeatureDirs(root)
      expect(dirs).toEqual([])
    })

    it("getFeatureDirs returns sorted feature dirs", async () => {
      const root = await worktree()
      const specsDir = specsDirPath(root)
      await fs.mkdir(path.join(specsDir, "003-third"), { recursive: true })
      await fs.mkdir(path.join(specsDir, "001-first"), { recursive: true })
      await fs.mkdir(path.join(specsDir, "002-second"), { recursive: true })
      const dirs = await getFeatureDirs(root)
      expect(dirs).toEqual(["001-first", "002-second", "003-third"])
    })

    it("getFeatureDirs ignores non-numeric dirs", async () => {
      const root = await worktree()
      const specsDir = specsDirPath(root)
      await fs.mkdir(path.join(specsDir, "001-valid"), { recursive: true })
      await fs.mkdir(path.join(specsDir, "invalid"), { recursive: true })
      const dirs = await getFeatureDirs(root)
      expect(dirs).toEqual(["001-valid"])
    })

    it("getLatestFeatureDir returns null for empty specs", async () => {
      const root = await worktree()
      expect(await getLatestFeatureDir(root)).toBeNull()
    })

    it("getLatestFeatureDir returns last feature dir", async () => {
      const root = await worktree()
      const specsDir = specsDirPath(root)
      await fs.mkdir(path.join(specsDir, "001-first"), { recursive: true })
      await fs.mkdir(path.join(specsDir, "002-second"), { recursive: true })
      expect(await getLatestFeatureDir(root)).toBe("002-second")
    })
  })

  describe("5.13 makeSpecJson", () => {
    it("creates valid SpecJson", () => {
      const sj = makeSpecJson("test feature", 1)
      expect(sj.feature_name).toBe("test feature")
      expect(sj.feature_number).toBe(1)
      expect(sj.phase).toBe("spec")
      expect(sj.approvals.spec.generated).toBe(false)
      expect(sj.ready_for_implementation).toBe(false)
    })

    it("sets created_at and updated_at to same value", () => {
      const sj = makeSpecJson("test", 1)
      expect(sj.created_at).toBe(sj.updated_at)
    })
  })
})
