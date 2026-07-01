import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import scaffoldTool from "../../speckit-scaffold"
import validateTool from "../../speckit-validate"
import auditTool from "../../speckit-audit"
import cleanTool from "../../speckit-clean"
import statusTool from "../../speckit-status"
import configTool from "../../speckit-config"
import {
  mockContext,
  createTempWorktree,
  destroyTempWorktree,
  createConstitution,
} from "../helpers/setup"
import {
  readSpecJson,
  specJsonPath,
  sessionPath,
  configPath,
  specsDirPath,
} from "../../shared/types"

describe("C-1: no worktree path", () => {
  it("scaffold returns error when no worktree", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "test", template: "spec" },
      { worktree: "" },
    )
    expect(result.title).toBe("Error")
    expect(result.output).toContain("worktree")
  })

  it("validate returns error when no worktree", async () => {
    const result = await validateTool.execute({}, { worktree: "" })
    expect(result.title).toBe("Error")
    expect(result.output).toContain("worktree")
  })

  it("audit returns error when no worktree", async () => {
    const result = await auditTool.execute({}, { worktree: "" })
    expect(result.title).toBe("Error")
    expect(result.output).toContain("worktree")
  })

  it("clean returns error when no worktree", async () => {
    const result = await cleanTool.execute({}, { worktree: "" })
    expect(result.title).toBe("Error")
    expect(result.output).toContain("worktree")
  })
})

describe("C-2: corrupt JSON handling", () => {
  let worktree: string
  let ctx: ReturnType<typeof mockContext>

  beforeEach(async () => {
    worktree = await createTempWorktree()
    ctx = mockContext(worktree)
  })

  afterEach(async () => {
    await destroyTempWorktree(worktree)
  })

  describe("corrupt spec.json", () => {
    async function createFeature(name: string): Promise<string> {
      const r = await scaffoldTool.execute(
        { featureName: name, template: "spec" },
        ctx,
      )
      return r.metadata?.featureDir as string
    }

    async function corruptSpecJson(featureDir: string): Promise<void> {
      const sjPath = specJsonPath(path.join(specsDirPath(worktree), featureDir))
      await fs.writeFile(sjPath, "not valid json at all {{[broken", "utf-8")
    }

    it("validate handles corrupt spec.json gracefully", async () => {
      const fd = await createFeature("test-corrupt")
      await corruptSpecJson(fd)
      const result = await validateTool.execute({}, ctx)
      expect(result.title).not.toBe("Error")
      expect(result.output).toContain("spec ok")
    })

    it("audit handles corrupt spec.json gracefully", async () => {
      const fd = await createFeature("test-corrupt")
      await corruptSpecJson(fd)
      const result = await auditTool.execute({}, ctx)
      expect(result.title).not.toBe("Error")
      expect(result.metadata?.errorCount).toBe(0)
      expect(result.output).toContain("spec.json")
    })

    it("clean handles corrupt spec.json gracefully", async () => {
      const fd = await createFeature("test-corrupt")
      await corruptSpecJson(fd)
      const result = await cleanTool.execute({}, ctx)
      expect(result.title).not.toBe("Error")
      expect(result.metadata?.total).toBe(1)
    })
  })

  describe("corrupt session.json", () => {
    async function corruptSession(): Promise<void> {
      await fs.writeFile(sessionPath(worktree), "{{bad json!!", "utf-8")
    }

    it("validate handles corrupt session gracefully", async () => {
      await createConstitution(worktree)
      await corruptSession()
      const result = await validateTool.execute({}, ctx)
      expect(result.title).not.toBe("Error")
    })

    it("status handles corrupt session gracefully", async () => {
      await createConstitution(worktree)
      await corruptSession()
      const result = await statusTool.execute({}, ctx)
      expect(result.title).not.toBe("Error")
    })

    it("clean handles corrupt session gracefully", async () => {
      await createConstitution(worktree)
      await corruptSession()
      const result = await cleanTool.execute({}, ctx)
      expect(result.title).not.toBe("Error")
    })
  })

  describe("corrupt config.json", () => {
    async function corruptConfig(): Promise<void> {
      const cfgDir = path.dirname(configPath(worktree))
      await fs.mkdir(cfgDir, { recursive: true })
      await fs.writeFile(configPath(worktree), "bad config{{{}}}", "utf-8")
    }

    it("config read handles corrupt config gracefully when reading", async () => {
      await createConstitution(worktree)
      await corruptConfig()
      const result = await configTool.execute({}, ctx)
      expect(result.title).not.toBe("Error")
    })

    it("config write still works after corrupt read", async () => {
      await createConstitution(worktree)
      await corruptConfig()
      const result = await configTool.execute(
        { defaultTechStack: "Node.js" },
        ctx,
      )
      expect(result.title).not.toBe("Error")
      expect(result.metadata?.defaultTechStack).toBe("Node.js")
    })
  })
})
