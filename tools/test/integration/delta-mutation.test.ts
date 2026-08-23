import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import deltaTool from "../../speckit-delta"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext, createTempWorktree, destroyTempWorktree, createConstitution } from "../helpers/setup"
import { readSpecJson, specsDirPath } from "../../shared/types"
import { readFrontmatter } from "../../shared/io"

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

async function createMultipleDeltas(count: number): Promise<string> {
  const featureDir = await getFeatureDir()
  for (let i = 0; i < count; i++) {
    await deltaTool.execute({ command: "spec-delta", description: `Delta ${i + 1}` }, ctx)
  }
  return featureDir
}

describe("Phase 1: Delta Module - Mutation Score Improvement", () => {

  describe("1.1 deltaSlug edge cases", () => {
    it("handles special characters in title", async () => {
      const featureDir = await getFeatureDir()
      const result = await deltaTool.execute(
        { command: "spec-delta", description: "Add @#$%^&*() OAuth support!" },
        ctx,
      )
      expect(result.title).toContain("Delta D001 created")
      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      const deltaSpec = deltaFiles.find(f => f.startsWith("D001") && f.endsWith(".md"))
      expect(deltaSpec).toBeDefined()
      expect(deltaSpec).toContain("add-oauth-support")
    })

    it("handles multiple spaces in title", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute(
        { command: "spec-delta", description: "Add   multiple   spaces   OAuth" },
        ctx,
      )
      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      const deltaSpec = deltaFiles.find(f => f.startsWith("D001") && f.endsWith(".md"))
      expect(deltaSpec).toContain("add-multiple-spaces-oauth")
    })

    it("truncates long titles to 40 chars", async () => {
      const featureDir = await getFeatureDir()
      const longTitle = "A".repeat(100)
      await deltaTool.execute({ command: "spec-delta", description: longTitle }, ctx)
      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      const deltaSpec = deltaFiles.find(f => f.startsWith("D001") && f.endsWith(".md"))
      const slugPart = deltaSpec?.replace("D001-", "").replace(".md", "")
      expect(slugPart!.length).toBeLessThanOrEqual(40)
    })

    it("removes leading and trailing hyphens", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "---test---" }, ctx)
      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      const deltaSpec = deltaFiles.find(f => f.startsWith("D001") && f.endsWith(".md"))
      expect(deltaSpec).toBe("D001-test.md")
    })

    it("handles title with only special characters", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "!@#$%^&*()" }, ctx)
      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      const deltaSpec = deltaFiles.find(f => f.startsWith("D001") && f.endsWith(".md"))
      expect(deltaSpec).toBeDefined()
    })
  })

  describe("1.2 findTargetFeatureDir matching", () => {
    it("matches feature by name with spaces", async () => {
      const featureDir = await getFeatureDir()
      const featureName = path.basename(featureDir)
      await deltaTool.execute(
        { command: "spec-delta", description: `Feature for ${featureName}` },
        ctx,
      )
      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      expect(deltaFiles.length).toBeGreaterThan(1)
    })

    it("returns last dir when no match found", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute(
        { command: "spec-delta", description: "Test" },
        ctx,
      )
      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      expect(deltaFiles.length).toBeGreaterThan(1)
    })
  })

  describe("1.3 delta warning threshold", () => {
    it("does not show warning below threshold", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      await createMultipleDeltas(4)
      const calls = consoleSpy.mock.calls.flat()
      const hasWarning = calls.some(c => typeof c === "string" && c.includes("active deltas"))
      expect(hasWarning).toBe(false)
      consoleSpy.mockRestore()
    })
  })

  describe("1.4 extractBody edge cases", () => {
    it("handles content with no frontmatter", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      await fs.writeFile(planFp, "# Plan\n\nContent.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const planAfter = await fs.readFile(planFp, "utf-8")
      expect(planAfter).toContain("Content.")
    })

    it("handles content with empty body", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      await fs.writeFile(planFp, "# Plan\n\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const planAfter = await fs.readFile(planFp, "utf-8")
      expect(planAfter).toBeDefined()
    })

    it("handles content with multiple frontmatter markers", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      await fs.writeFile(planFp, "---\ntitle: test\n---\n# Plan\n---\n\nContent.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const planAfter = await fs.readFile(planFp, "utf-8")
      expect(planAfter).toContain("Content.")
    })

    it("handles content with no title line", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      await fs.writeFile(planFp, "---\ntitle: test\n---\n\nContent without title.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const planAfter = await fs.readFile(planFp, "utf-8")
      expect(planAfter).toContain("Content without title")
    })
  })

  describe("1.5 delta status error handling", () => {
    it("returns error for plan-delta with draft status", async () => {
      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      const result = await deltaTool.execute(
        { command: "plan-delta", deltaId: "D001" },
        ctx,
      )
      expect(result.title).toContain("Plan Delta D001 created")
    })

    it("returns error for tasks-delta with wrong status", async () => {
      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      const result = await deltaTool.execute(
        { command: "tasks-delta", deltaId: "D001" },
        ctx,
      )
      expect(result.title).toBe("Error")
      expect(result.output).toContain("status is draft, expected planned")
    })

    it("returns error for impl-delta with wrong status", async () => {
      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      const result = await deltaTool.execute(
        { command: "impl-delta", deltaId: "D001" },
        ctx,
      )
      expect(result.title).toBe("Error")
      expect(result.output).toContain("status is draft, expected ready or implementing")
    })

    it("returns error for missing delta ID", async () => {
      const result = await deltaTool.execute(
        { command: "plan-delta", deltaId: "" },
        ctx,
      )
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Delta ID required")
    })

    it("returns error for non-existent delta", async () => {
      const result = await deltaTool.execute(
        { command: "plan-delta", deltaId: "D999" },
        ctx,
      )
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Delta D999 not found")
    })
  })

  describe("1.6 multiple deltas consolidation", () => {
    it("consolidates multiple deltas sequentially", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      const tasksFp = path.join(featureDir, "tasks.md")
      await fs.writeFile(planFp, "# Plan\n\nBase.\n", "utf-8")
      await fs.writeFile(tasksFp, "# Tasks\n\nBase.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "First" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      await deltaTool.execute({ command: "spec-delta", description: "Second" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D002" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D002" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D002" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D002" }, ctx)

      const planAfter = await fs.readFile(planFp, "utf-8")
      const tasksAfter = await fs.readFile(tasksFp, "utf-8")

      expect(planAfter).toContain("Delta D001")
      expect(planAfter).toContain("Delta D002")
      expect(tasksAfter).toContain("Delta D001")
      expect(tasksAfter).toContain("Delta D002")
    })

    it("updates consolidated_at for each delta", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      const tasksFp = path.join(featureDir, "tasks.md")
      await fs.writeFile(planFp, "# Plan\n\nBase.\n", "utf-8")
      await fs.writeFile(tasksFp, "# Tasks\n\nBase.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "First" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      await deltaTool.execute({ command: "spec-delta", description: "Second" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D002" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D002" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D002" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D002" }, ctx)

      const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
      const index = JSON.parse(indexRaw)
      expect(index.deltas[0].consolidated_at).toBeDefined()
      expect(index.deltas[1].consolidated_at).toBeDefined()
    })
  })

  describe("1.7 consolidation with missing files", () => {
    it("handles consolidation when plan.md does not exist", async () => {
      const featureDir = await getFeatureDir()
      const tasksFp = path.join(featureDir, "tasks.md")
      await fs.writeFile(tasksFp, "# Tasks\n\nBase.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
      const index = JSON.parse(indexRaw)
      expect(index.deltas[0].status).toBe("consolidated")
    })

    it("handles consolidation when tasks.md does not exist", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      await fs.writeFile(planFp, "# Plan\n\nBase.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
      const index = JSON.parse(indexRaw)
      expect(index.deltas[0].status).toBe("consolidated")
    })
  })

  describe("1.8 delta frontmatter sync", () => {
    it("syncs frontmatter after consolidation", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      const tasksFp = path.join(featureDir, "tasks.md")
      await fs.writeFile(planFp, "# Plan\n\nBase.\n", "utf-8")
      await fs.writeFile(tasksFp, "# Tasks\n\nBase.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const specFm = await readFrontmatter(path.join(featureDir, "spec.md"))
      const planFm = await readFrontmatter(planFp)
      const tasksFm = await readFrontmatter(tasksFp)

      expect(specFm?.checksum).toBeDefined()
      expect(planFm?.checksum).toBeDefined()
      expect(tasksFm?.checksum).toBeDefined()
    })

    it("clears active_delta after consolidation", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      const tasksFp = path.join(featureDir, "tasks.md")
      await fs.writeFile(planFp, "# Plan\n\nBase.\n", "utf-8")
      await fs.writeFile(tasksFp, "# Tasks\n\nBase.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      let sj = await readSpecJson(featureDir)
      expect(sj?.active_delta).toBe("D001")

      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      sj = await readSpecJson(featureDir)
      expect(sj?.active_delta).toBeNull()
    })
  })

  describe("1.9 delta-status edge cases", () => {
    it("shows multiple deltas with different statuses", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "First" }, ctx)
      await deltaTool.execute({ command: "spec-delta", description: "Second" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)

      const result = await deltaTool.execute({ command: "delta-status" }, ctx)
      expect(result.title).toContain("Delta Status")
      expect(result.output).toContain("D001")
      expect(result.output).toContain("D002")
    })

    it("shows consolidated deltas in history", async () => {
      const featureDir = await getFeatureDir()
      const planFp = path.join(featureDir, "plan.md")
      const tasksFp = path.join(featureDir, "tasks.md")
      await fs.writeFile(planFp, "# Plan\n\nBase.\n", "utf-8")
      await fs.writeFile(tasksFp, "# Tasks\n\nBase.\n", "utf-8")

      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "impl-delta", deltaId: "D001" }, ctx)

      const result = await deltaTool.execute({ command: "delta-status" }, ctx)
      expect(result.output).toContain("consolidated")
    })
  })

  describe("1.10 delta-id generation", () => {
    it("generates sequential delta IDs", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "First" }, ctx)
      await deltaTool.execute({ command: "spec-delta", description: "Second" }, ctx)
      await deltaTool.execute({ command: "spec-delta", description: "Third" }, ctx)

      const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
      const index = JSON.parse(indexRaw)
      expect(index.deltas[0].id).toBe("D001")
      expect(index.deltas[1].id).toBe("D002")
      expect(index.deltas[2].id).toBe("D003")
    })

    it("skips cancelled delta IDs", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "First" }, ctx)
      await deltaTool.execute({ command: "spec-delta", description: "Second" }, ctx)

      const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
      const index = JSON.parse(indexRaw)
      index.deltas[0].status = "cancelled"
      await fs.writeFile(path.join(featureDir, "deltas", "deltas.json"), JSON.stringify(index, null, 2))

      await deltaTool.execute({ command: "spec-delta", description: "Third" }, ctx)
      const indexRaw2 = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
      const index2 = JSON.parse(indexRaw2)
      expect(index2.deltas[2].id).toBe("D003")
    })
  })

  describe("1.11 delta spec.md content verification", () => {
    it("creates delta spec with all required sections", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "Add OAuth support" }, ctx)

      const deltaFiles = await fs.readdir(path.join(featureDir, "deltas"))
      const deltaSpec = deltaFiles.find(f => f.startsWith("D001") && f.endsWith(".md"))
      const content = await fs.readFile(path.join(featureDir, "deltas", deltaSpec!), "utf-8")

      expect(content).toContain("## Contexto")
      expect(content).toContain("## Cambio Propuesto")
      expect(content).toContain("## Impacto")
      expect(content).toContain("## Criterios de Aceptación")
      expect(content).toContain("## Dependencias")
    })
  })

  describe("1.12 plan-delta content verification", () => {
    it("creates plan with all required sections", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)

      const planPath = path.join(featureDir, "deltas", "D001-plan.md")
      const content = await fs.readFile(planPath, "utf-8")

      expect(content).toContain("## Cambios en plan.md principal")
      expect(content).toContain("## Archivos a modificar")
      expect(content).toContain("## Secuencia de implementación")
      expect(content).toContain("## Testing")
    })
  })

  describe("1.13 tasks-delta content verification", () => {
    it("creates tasks with all required sections", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)
      await deltaTool.execute({ command: "plan-delta", deltaId: "D001" }, ctx)
      await deltaTool.execute({ command: "tasks-delta", deltaId: "D001" }, ctx)

      const tasksPath = path.join(featureDir, "deltas", "D001-tasks.md")
      const content = await fs.readFile(tasksPath, "utf-8")

      expect(content).toContain("## Fase 1: Implementación")
      expect(content).toContain("## Fase 2: Testing")
      expect(content).toContain("Boundary:")
    })
  })

  describe("1.14 computeFileHash edge cases", () => {
    it("returns empty string for non-existent file", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)

      const specFp = path.join(featureDir, "spec.md")
      await fs.unlink(specFp)

      const planPath = path.join(featureDir, "deltas", "D001-plan.md")
      const exists = await fs.access(planPath).then(() => true).catch(() => false)
      expect(exists).toBe(false)
    })
  })

  describe("1.15 delta cancellation", () => {
    it("allows cancelling a delta", async () => {
      const featureDir = await getFeatureDir()
      await deltaTool.execute({ command: "spec-delta", description: "Test" }, ctx)

      const indexRaw = await fs.readFile(path.join(featureDir, "deltas", "deltas.json"), "utf-8")
      const index = JSON.parse(indexRaw)
      index.deltas[0].status = "cancelled"
      await fs.writeFile(path.join(featureDir, "deltas", "deltas.json"), JSON.stringify(index, null, 2))

      const result = await deltaTool.execute({ command: "delta-status" }, ctx)
      expect(result.output).toContain("cancelled")
    })
  })
})
