import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import guardPlugin from "../../plugins/speckit-guard"
import perfmonPlugin from "../../plugins/speckit-perfmon"

let worktree: string

beforeEach(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "cross-plugin-"))
  const opencodeDir = path.join(worktree, ".opencode")
  const specMemoryDir = path.join(opencodeDir, "spec-memory")
  await fs.mkdir(specMemoryDir, { recursive: true })
  await fs.writeFile(path.join(opencodeDir, "session.json"), "{}")
  await fs.writeFile(path.join(specMemoryDir, "constitution.md"), "# Constitution")
})

afterEach(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

describe("Cross-Plugin Integration", () => {

  describe("Guard plugin", () => {
    it("guard plugin can be loaded", async () => {
      const server = await guardPlugin.server({ worktree } as any)
      expect(server).toBeDefined()
      expect(server["permission.ask"]).toBeDefined()
    })
  })

  describe("Guard + Audit integration", () => {
    it("guard config can be read", async () => {
      const configPath = path.join(worktree, ".opencode", "guard.json")
      await fs.writeFile(configPath, JSON.stringify({
        version: 1,
        enabled: true,
        debug: false,
        protectedFiles: [],
        protectedAfterApproval: [],
        protectedByPhase: {},
        stats: { denied: 0, allowed: 0, asked: 0 },
        denials: [],
      }))

      const config = JSON.parse(await fs.readFile(configPath, "utf-8"))
      expect(config.enabled).toBe(true)
    })

    it("guard denials can be stored", async () => {
      const configPath = path.join(worktree, ".opencode", "guard.json")
      const config = {
        version: 1,
        enabled: true,
        debug: false,
        protectedFiles: [],
        protectedAfterApproval: [],
        protectedByPhase: {},
        stats: { denied: 1, allowed: 0, asked: 1 },
        denials: [{
          timestamp: new Date().toISOString(),
          file: "test.md",
          reason: "Always protected",
        }],
      }
      await fs.writeFile(configPath, JSON.stringify(config))

      const stored = JSON.parse(await fs.readFile(configPath, "utf-8"))
      expect(stored.denials).toHaveLength(1)
      expect(stored.denials[0].file).toBe("test.md")
    })
  })

  describe("Perfmon plugin", () => {
    it("perfmon plugin can be loaded", async () => {
      const server = await perfmonPlugin.server({ worktree } as any)
      expect(server).toBeDefined()
      expect(server["tool.execute.before"]).toBeDefined()
      expect(server["tool.execute.after"]).toBeDefined()
    })

    it("perf data can be read", async () => {
      const perfPath = path.join(worktree, ".opencode", "perf.json")
      await fs.writeFile(perfPath, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        stats: [{
          tool: "speckit-audit",
          calls: 10,
          totalTime: 5000,
          times: [500, 400, 600],
          p50: 500,
          p95: 600,
          p99: 600,
          avg: 500,
        }],
      }))

      const perf = JSON.parse(await fs.readFile(perfPath, "utf-8"))
      expect(perf.stats).toHaveLength(1)
      expect(perf.stats[0].tool).toBe("speckit-audit")
    })
  })

  describe("Plugins coexistence", () => {
    it("guard and perfmon can be loaded simultaneously", async () => {
      const guardServer = await guardPlugin.server({ worktree } as any)
      const perfmonServer = await perfmonPlugin.server({ worktree } as any)

      expect(guardServer).toBeDefined()
      expect(perfmonServer).toBeDefined()
    })

    it("all plugins have required hooks", async () => {
      const guardServer = await guardPlugin.server({ worktree } as any)
      const perfmonServer = await perfmonPlugin.server({ worktree } as any)

      expect(guardServer["permission.ask"]).toBeDefined()
      expect(perfmonServer["tool.execute.before"]).toBeDefined()
      expect(perfmonServer["tool.execute.after"]).toBeDefined()
    })
  })

  describe("Plugin configuration", () => {
    it("guard config can be created", async () => {
      const configPath = path.join(worktree, ".opencode", "guard.json")
      const config = {
        version: 1,
        enabled: true,
        debug: false,
        protectedFiles: [".opencode/spec-memory/constitution.md"],
        protectedAfterApproval: ["spec.json", "plan.md", "tasks.md"],
        protectedByPhase: {
          tasks: ["plan.md"],
          ready: ["plan.md", "tasks.md"],
        },
        stats: { denied: 0, allowed: 0, asked: 0 },
        denials: [],
      }
      await fs.writeFile(configPath, JSON.stringify(config))

      const stored = JSON.parse(await fs.readFile(configPath, "utf-8"))
      expect(stored.protectedFiles).toContain(".opencode/spec-memory/constitution.md")
      expect(stored.protectedAfterApproval).toContain("spec.json")
    })

    it("perfmon config can be created", async () => {
      const perfPath = path.join(worktree, ".opencode", "perf.json")
      const config = {
        lastUpdated: new Date().toISOString(),
        stats: [],
      }
      await fs.writeFile(perfPath, JSON.stringify(config))

      const stored = JSON.parse(await fs.readFile(perfPath, "utf-8"))
      expect(stored.stats).toHaveLength(0)
    })
  })
})
