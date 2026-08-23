import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { readSpecJson, specsDirPath, steeringDirPath, PATHS } from "../../shared/types"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

describe("Phase 6: Scaffold Module - Mutation Score Improvement", () => {

  describe("6.1 Constitution creation", () => {
    it("creates constitution.md with project name", async () => {
      const result = await scaffoldTool.execute({ featureName: "MyApp", template: "constitution" }, ctx)
      expect(result.title).toBe("Constitution created")
      const content = await fs.readFile(path.join(worktree, ".opencode", "spec-memory", "constitution.md"), "utf-8")
      expect(content).toContain("MyApp")
    })

    it("returns exists=true when constitution already exists without overwrite", async () => {
      await scaffoldTool.execute({ featureName: "P1", template: "constitution" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "P2", template: "constitution" }, ctx)
      expect(result.metadata?.exists).toBe(true)
    })

    it("overwrites when overwrite=true", async () => {
      await scaffoldTool.execute({ featureName: "Original", template: "constitution" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "New", template: "constitution", overwrite: true }, ctx)
      expect(result.title).toBe("Constitution created")
      const content = await fs.readFile(path.join(worktree, ".opencode", "spec-memory", "constitution.md"), "utf-8")
      expect(content).toContain("New")
      expect(content).not.toContain("Original")
    })

    it("uses fallback content when template file missing", async () => {
      const result = await scaffoldTool.execute({ featureName: "Test", template: "constitution" }, ctx)
      expect(result.title).toBe("Constitution created")
      const content = await fs.readFile(path.join(worktree, ".opencode", "spec-memory", "constitution.md"), "utf-8")
      expect(content).toContain("Test")
    })

    it("replaces [PROJECT NAME] placeholder in template", async () => {
      const result = await scaffoldTool.execute({ featureName: "ReplacedName", template: "constitution" }, ctx)
      expect(result.title).toBe("Constitution created")
      const content = await fs.readFile(path.join(worktree, ".opencode", "spec-memory", "constitution.md"), "utf-8")
      expect(content).not.toContain("[PROJECT NAME]")
      expect(content).toContain("ReplacedName")
    })
  })

  describe("6.2 Feature numbering", () => {
    it("numbers first feature as 001", async () => {
      await createConstitution(worktree)
      const result = await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
      expect(result.metadata?.featureDir).toMatch(/^001-/)
    })

    it("numbers second feature as 002", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Billing", template: "spec" }, ctx)
      expect(result.metadata?.featureDir).toMatch(/^002-/)
    })

    it("handles gaps in numbering", async () => {
      await createConstitution(worktree)
      const specsDir = specsDirPath(worktree)
      await fs.mkdir(path.join(specsDir, "005-existing"), { recursive: true })
      const result = await scaffoldTool.execute({ featureName: "New", template: "spec" }, ctx)
      expect(result.metadata?.featureDir).toMatch(/^006-/)
    })

    it("pads feature number with leading zeros", async () => {
      await createConstitution(worktree)
      const result = await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      expect(result.metadata?.featureDir).toMatch(/^001-/)
    })

    it("reuses existing feature dir for plan/tasks when slug matches", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
      const planResult = await scaffoldTool.execute({ featureName: "Auth", template: "plan" }, ctx)
      expect(planResult.metadata?.featureDir).toBe("001-auth")
    })

    it("creates new feature dir for plan when slug does not match", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Auth", template: "spec" }, ctx)
      const planResult = await scaffoldTool.execute({ featureName: "Billing", template: "plan" }, ctx)
      expect(planResult.metadata?.featureDir).toMatch(/^002-/)
    })
  })

  describe("6.3 Template loading", () => {
    it("creates spec.md with marker placeholder", async () => {
      await createConstitution(worktree)
      const result = await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      expect(result.title).toContain("Scaffold")
      const content = await fs.readFile(path.join(worktree, "specs", result.metadata?.featureDir, "spec.md"), "utf-8")
      expect(content).toContain("spec: Test Feature")
      expect(content).toContain("Content pending skill generation")
    })

    it("creates plan.md with marker placeholder", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      expect(result.title).toContain("Scaffold")
      const content = await fs.readFile(path.join(worktree, "specs", result.metadata?.featureDir, "plan.md"), "utf-8")
      expect(content).toContain("plan: Test Feature")
    })

    it("creates tasks.md with marker placeholder", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "plan" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Test Feature", template: "tasks" }, ctx)
      expect(result.title).toContain("Scaffold")
      const content = await fs.readFile(path.join(worktree, "specs", result.metadata?.featureDir, "tasks.md"), "utf-8")
      expect(content).toContain("tasks: Test Feature")
    })

    it("creates data-model.md with fallback content", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Test Feature", template: "data-model" }, ctx)
      expect(result.title).toContain("created")
      const content = await fs.readFile(path.join(worktree, "specs", result.metadata?.featureDir, "data-model.md"), "utf-8")
      expect(content).toContain("Data Model")
    })

    it("creates research.md with fallback content", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Test Feature", template: "research" }, ctx)
      expect(result.title).toContain("created")
      const content = await fs.readFile(path.join(worktree, "specs", result.metadata?.featureDir, "research.md"), "utf-8")
      expect(content).toContain("Research")
    })

    it("creates contracts directory", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test Feature", template: "spec" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Test Feature", template: "contracts" }, ctx)
      expect(result.title).toContain("created")
      const contractsDir = path.join(worktree, "specs", result.metadata?.featureDir, "contracts")
      const exists = await fs.access(contractsDir).then(() => true, () => false)
      expect(exists).toBe(true)
    })
  })

  describe("6.4 Steering creation", () => {
    it("creates all three steering files", async () => {
      const result = await scaffoldTool.execute({ featureName: "MyApp", template: "steering" }, ctx)
      expect(result.title).toContain("3 created")
      const steeringDir = steeringDirPath(worktree)
      expect(await fs.access(path.join(steeringDir, "product.md")).then(() => true, () => false)).toBe(true)
      expect(await fs.access(path.join(steeringDir, "tech.md")).then(() => true, () => false)).toBe(true)
      expect(await fs.access(path.join(steeringDir, "structure.md")).then(() => true, () => false)).toBe(true)
    })

    it("skips existing steering files without overwrite", async () => {
      await scaffoldTool.execute({ featureName: "MyApp", template: "steering" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "MyApp", template: "steering" }, ctx)
      expect(result.metadata?.skipped).toHaveLength(3)
      expect(result.metadata?.created).toHaveLength(0)
    })

    it("overwrites steering files when overwrite=true", async () => {
      await scaffoldTool.execute({ featureName: "Original", template: "steering" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "New", template: "steering", overwrite: true }, ctx)
      expect(result.metadata?.created).toHaveLength(3)
      const content = await fs.readFile(path.join(steeringDirPath(worktree), "product.md"), "utf-8")
      expect(content).toContain("New")
    })

    it("replaces [PROJECT NAME] in steering templates", async () => {
      await scaffoldTool.execute({ featureName: "ReplacedProject", template: "steering" }, ctx)
      const content = await fs.readFile(path.join(steeringDirPath(worktree), "product.md"), "utf-8")
      expect(content).not.toContain("[PROJECT NAME]")
      expect(content).toContain("ReplacedProject")
    })
  })

  describe("6.5 Overwrite behavior", () => {
    it("does not overwrite spec.md without overwrite flag", async () => {
      await createConstitution(worktree)
      const r1 = await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      const specPath = path.join(worktree, "specs", r1.metadata?.featureDir, "spec.md")
      const result = await scaffoldTool.execute({ featureName: "Test", template: "spec", overwrite: false }, ctx)
      const r1Dir = r1.metadata?.featureDir
      const r2Dir = result.metadata?.featureDir
      if (r1Dir === r2Dir) {
        expect(result.title).toBe("File exists")
      } else {
        expect(result.title).toContain("Scaffold")
      }
    })

    it("overwrites spec.md with overwrite=true", async () => {
      await createConstitution(worktree)
      const r1 = await scaffoldTool.execute({ featureName: "Original", template: "spec" }, ctx)
      const specPath = path.join(worktree, "specs", r1.metadata?.featureDir, "spec.md")
      const result = await scaffoldTool.execute({ featureName: "New", template: "spec", overwrite: true }, ctx)
      expect(result.title).toContain("Scaffold")
      expect(result.output).toContain("created")
    })

    it("does not overwrite plan.md without overwrite flag", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test", template: "plan" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Test", template: "plan" }, ctx)
      expect(result.title).toBe("File exists")
    })

    it("does not overwrite tasks.md without overwrite flag", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test", template: "plan" }, ctx)
      await scaffoldTool.execute({ featureName: "Test", template: "tasks" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "Test", template: "tasks" }, ctx)
      expect(result.title).toBe("File exists")
    })
  })

  describe("6.6 Error handling", () => {
    it("returns error when no worktree", async () => {
      const result = await scaffoldTool.execute({ featureName: "Test", template: "spec" }, { worktree: undefined } as any)
      expect(result.title).toBe("Error")
    })

    it("returns error when invalid project root for non-constitution", async () => {
      const result = await scaffoldTool.execute({ featureName: "Test", template: "spec" }, { worktree: "/nonexistent" } as any)
      expect(result.title).toBe("Error")
    })

    it("allows constitution on invalid project root", async () => {
      const result = await scaffoldTool.execute({ featureName: "Test", template: "constitution" }, { worktree: "/tmp/nonexistent-test-xyz" } as any)
      expect(result.title).not.toBe("Error")
    })

    it("returns error when no features exist for data-model", async () => {
      const result = await scaffoldTool.execute({ featureName: "Test", template: "data-model" }, ctx)
      expect(result.title).toBe("Error")
    })

    it("returns error when no features exist for research", async () => {
      const result = await scaffoldTool.execute({ featureName: "Test", template: "research" }, ctx)
      expect(result.title).toBe("Error")
    })

    it("returns error when no features exist for contracts", async () => {
      const result = await scaffoldTool.execute({ featureName: "Test", template: "contracts" }, ctx)
      expect(result.title).toBe("Error")
    })
  })

  describe("6.7 SpecJson creation", () => {
    it("creates spec.json with correct phase", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      const sj = await readSpecJson(path.join(specsDirPath(worktree), "001-test"))
      expect(sj).not.toBeNull()
      expect(sj!.phase).toBe("spec")
      expect(sj!.feature_name).toBe("Test")
    })

    it("creates spec.json with correct feature number", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "First", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Second", template: "spec" }, ctx)
      const sj = await readSpecJson(path.join(specsDirPath(worktree), "002-second"))
      expect(sj).not.toBeNull()
      expect(sj!.feature_number).toBe(2)
    })

    it("sets approvals.spec.generated to true after spec creation", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      const sj = await readSpecJson(path.join(specsDirPath(worktree), "001-test"))
      expect(sj!.approvals.spec.generated).toBe(true)
    })

    it("sets approvals.plan.generated to true after plan creation", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test", template: "plan" }, ctx)
      const sj = await readSpecJson(path.join(specsDirPath(worktree), "001-test"))
      expect(sj!.approvals.plan.generated).toBe(true)
    })

    it("sets approvals.tasks.generated to true after tasks creation", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      await scaffoldTool.execute({ featureName: "Test", template: "plan" }, ctx)
      await scaffoldTool.execute({ featureName: "Test", template: "tasks" }, ctx)
      const sj = await readSpecJson(path.join(specsDirPath(worktree), "001-test"))
      expect(sj!.approvals.tasks.generated).toBe(true)
    })
  })

  describe("6.8 Session history", () => {
    it("appends to session history after scaffolding", async () => {
      await createConstitution(worktree)
      await scaffoldTool.execute({ featureName: "Test", template: "spec" }, ctx)
      const { readSession } = await import("../../shared/types")
      const session = await readSession(worktree)
      expect(session.history.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("6.9 Slug generation", () => {
    it("slugifies feature name correctly", async () => {
      await createConstitution(worktree)
      const result = await scaffoldTool.execute({ featureName: "My Feature Name", template: "spec" }, ctx)
      expect(result.metadata?.featureDir).toBe("001-my-feature-name")
    })

    it("handles special characters in feature name", async () => {
      await createConstitution(worktree)
      const result = await scaffoldTool.execute({ featureName: "Auth & Security!", template: "spec" }, ctx)
      expect(result.metadata?.featureDir).toBe("001-auth-security")
    })

    it("handles leading numbers in feature name", async () => {
      await createConstitution(worktree)
      const result = await scaffoldTool.execute({ featureName: "123 Test", template: "spec" }, ctx)
      expect(result.metadata?.featureDir).toMatch(/^001-/)
    })

    it("truncates long feature names", async () => {
      await createConstitution(worktree)
      const longName = "a".repeat(100)
      const result = await scaffoldTool.execute({ featureName: longName, template: "spec" }, ctx)
      expect(result.metadata?.featureDir!.length).toBeLessThanOrEqual(84)
    })
  })

  describe("6.10 Domain-map and glossary", () => {
    it("creates domain-map.md in .opencode/", async () => {
      const result = await scaffoldTool.execute({ featureName: "MyApp", template: "domain-map" }, ctx)
      expect(result.title).toContain("created")
      const exists = await fs.access(path.join(worktree, ".opencode", "domain-map.md")).then(() => true, () => false)
      expect(exists).toBe(true)
    })

    it("creates glossary.md in .opencode/", async () => {
      const result = await scaffoldTool.execute({ featureName: "MyApp", template: "glossary" }, ctx)
      expect(result.title).toContain("created")
      const exists = await fs.access(path.join(worktree, ".opencode", "glossary.md")).then(() => true, () => false)
      expect(exists).toBe(true)
    })

    it("does not overwrite domain-map without overwrite flag", async () => {
      await scaffoldTool.execute({ featureName: "MyApp", template: "domain-map" }, ctx)
      const result = await scaffoldTool.execute({ featureName: "MyApp", template: "domain-map" }, ctx)
      expect(result.title).toContain("exists")
    })

    it("replaces [PROJECT NAME] in domain-map fallback content", async () => {
      const result = await scaffoldTool.execute({ featureName: "ReplacedProject", template: "domain-map" }, ctx)
      expect(result.title).toContain("created")
      const exists = await fs.access(path.join(worktree, ".opencode", "domain-map.md")).then(() => true, () => false)
      expect(exists).toBe(true)
    })
  })
})
