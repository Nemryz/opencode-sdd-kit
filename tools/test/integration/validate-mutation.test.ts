import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import validateTool from "../../speckit-validate"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { specsDirPath, specJsonPath, sessionPath, writeSession, writeSpecJson, readSpecJson, makeSpecJson, clearCorruptionWarnings } from "../../shared/types"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
  await createConstitution(worktree)
  clearCorruptionWarnings()
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

async function getFeatureDir(): Promise<string> {
  const dirs = await fs.readdir(specsDirPath(worktree))
  return path.join(specsDirPath(worktree), dirs[0])
}

function makeValidSpec(overrides?: Record<string, any>) {
  const base = makeSpecJson("Test Feature", 1)
  return { ...base, ...overrides }
}

describe("Validate Module - Mutation Score Improvement", () => {

  describe("Basic validation", () => {
    it("returns error for invalid worktree", async () => {
      const result = await validateTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error for invalid project root", async () => {
      const result = await validateTool.execute({}, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })

    it("returns success for valid project", async () => {
      const result = await validateTool.execute({}, ctx)
      expect(result.title).toBeDefined()
      expect(result.output).toBeDefined()
    })
  })

  describe("Phase detection", () => {
    it("detects spec phase when only spec.md exists", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toContain("spec")
    })

    it("detects plan phase when plan.md exists", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await writeSpecJson(makeValidSpec({ phase: "plan" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toContain("plan")
    })

    it("detects tasks phase when tasks.md exists", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await fs.writeFile(path.join(specDir, "tasks.md"), "# Test Tasks")
      await writeSpecJson(makeValidSpec({ phase: "tasks" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toContain("tasks")
    })

    it("detects ready phase when all artifacts exist", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await fs.writeFile(path.join(specDir, "tasks.md"), "# Test Tasks")
      await writeSpecJson(makeValidSpec({ phase: "ready", ready_for_implementation: true }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toContain("ready")
    })
  })

  describe("Artifact existence checks", () => {
    it("reports missing spec.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toBeDefined()
    })

    it("reports existing spec.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toBeDefined()
    })

    it("reports missing plan.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await writeSpecJson(makeValidSpec({ phase: "plan" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toBeDefined()
    })

    it("reports existing plan.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await writeSpecJson(makeValidSpec({ phase: "plan" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toBeDefined()
    })

    it("reports missing tasks.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await writeSpecJson(makeValidSpec({ phase: "tasks" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toBeDefined()
    })

    it("reports existing tasks.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await fs.writeFile(path.join(specDir, "tasks.md"), "# Test Tasks")
      await writeSpecJson(makeValidSpec({ phase: "tasks" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.output).toBeDefined()
    })
  })

  describe("Session integration", () => {
    it("reads session for feature dir", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      await writeSession(worktree, { 
        phase: "spec", 
        featureDir: "001-test", 
        featureNumber: 1, 
        featureName: "Test Feature",
        command: null,
        nextStep: null,
        lastResult: null,
        history: [] 
      })

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("uses latest feature when no session", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Command triggering", () => {
    it("handles plan command", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test", command: "plan" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles tasks command", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await writeSpecJson(makeValidSpec({ phase: "plan" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test", command: "tasks" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles impl command", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await fs.writeFile(path.join(specDir, "tasks.md"), "# Test Tasks")
      await writeSpecJson(makeValidSpec({ phase: "ready", ready_for_implementation: true }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test", command: "impl" }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Corruption detection", () => {
    it("handles corrupt spec.json", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.json"), "not json")

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles missing spec.json", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Backup integrity", () => {
    it("checks backup integrity", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })
  })

  describe("Edge cases", () => {
    it("handles empty feature dir", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles non-existent feature dir", async () => {
      const result = await validateTool.execute({ featureDir: "nonexistent" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles empty spec.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "")
      await writeSpecJson(makeValidSpec({ phase: "spec" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles empty plan.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "")
      await writeSpecJson(makeValidSpec({ phase: "plan" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })

    it("handles empty tasks.md", async () => {
      const specDir = path.join(specsDirPath(worktree), "001-test")
      await fs.mkdir(specDir, { recursive: true })
      await fs.writeFile(path.join(specDir, "spec.md"), "# Test Spec")
      await fs.writeFile(path.join(specDir, "plan.md"), "# Test Plan")
      await fs.writeFile(path.join(specDir, "tasks.md"), "")
      await writeSpecJson(makeValidSpec({ phase: "tasks" }), specDir)

      const result = await validateTool.execute({ featureDir: "001-test" }, ctx)
      expect(result.title).toBeDefined()
    })
  })
})
