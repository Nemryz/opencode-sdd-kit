import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  isProtectedFile,
  isProtectedAfterApproval,
  isApprovedForFile,
  isProtectedByPhase,
  addDenial,
  DEFAULT_CONFIG,
  type GuardConfig,
} from "../../plugins/speckit-guard"
import guardTool from "../../speckit-guard"

describe("speckit-guard mutation", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "guard-mutation-"))
    const opencodeDir = path.join(tmpDir, ".opencode")
    const specMemoryDir = path.join(opencodeDir, "spec-memory")
    await fs.mkdir(specMemoryDir, { recursive: true })
    await fs.writeFile(path.join(opencodeDir, "session.json"), "{}")
    await fs.writeFile(path.join(specMemoryDir, "constitution.md"), "# Constitution")
    const specsDir = path.join(tmpDir, "specs")
    await fs.mkdir(specsDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function runTool(args: any = {}) {
    return guardTool.execute(args, { worktree: tmpDir, sessionID: "test", callID: "test" })
  }

  describe("isProtectedFile mutations", () => {
    it("returns string for protected files", () => {
      const result = isProtectedFile("constitution.md", DEFAULT_CONFIG)
      expect(typeof result).toBe("string")
    })

    it("returns null for unprotected files", () => {
      const result = isProtectedFile("random.md", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })

    it("matches basename", () => {
      const result = isProtectedFile("any/path/constitution.md", DEFAULT_CONFIG)
      expect(result).toContain("Always protected")
    })
  })

  describe("isProtectedAfterApproval mutations", () => {
    it("returns string for protected files", () => {
      const result = isProtectedAfterApproval("spec.json", DEFAULT_CONFIG)
      expect(typeof result).toBe("string")
    })

    it("returns null for unprotected files", () => {
      const result = isProtectedAfterApproval("random.md", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })
  })

  describe("isApprovedForFile mutations", () => {
    it("returns boolean", () => {
      const spec = { phase: "ready", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: true }, tasks: { generated: true, approved: true } } }
      const result = isApprovedForFile("spec.json", spec)
      expect(typeof result).toBe("boolean")
    })
  })

  describe("isProtectedByPhase mutations", () => {
    it("returns string for protected files", () => {
      const result = isProtectedByPhase("plan.md", "tasks", DEFAULT_CONFIG)
      expect(typeof result).toBe("string")
    })

    it("returns null for unprotected files", () => {
      const result = isProtectedByPhase("random.md", "tasks", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })
  })

  describe("addDenial mutations", () => {
    it("adds denial", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      addDenial(config, "test.md", "reason")
      expect(config.denials.length).toBe(1)
    })

    it("denial has timestamp", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      addDenial(config, "test.md", "reason")
      expect(config.denials[0].timestamp).toBeDefined()
    })
  })

  describe("guard tool mutations", () => {
    it("status returns title", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBeDefined()
    })

    it("status returns output string", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(typeof result.output).toBe("string")
    })

    it("on returns title", async () => {
      const result = await runTool({ subcommand: "on" })
      expect(result.title).toBeDefined()
    })

    it("off returns requiresConfirmation", async () => {
      const result = await runTool({ subcommand: "off" })
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("onConfirm returns title", async () => {
      const result = await runTool({ subcommand: "off" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.title).toBeDefined()
    })

    it("unknown subcommand returns error", async () => {
      const result = await runTool({ subcommand: "xyz" })
      expect(result.title).toBe("Error")
    })
  })

  describe("guard plugin hooks", () => {
    it("plugin has correct id", async () => {
      const mod = await import("../../plugins/speckit-guard")
      const plugin = mod.default
      expect(plugin.id).toBe("speckit-guard")
      expect(plugin.server).toBeDefined()
    })

    it("plugin server is function", async () => {
      const mod = await import("../../plugins/speckit-guard")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      expect(typeof server).toBe("object")
    })

    it("permission.ask hook is function", async () => {
      const mod = await import("../../plugins/speckit-guard")
      const server = await mod.default.server({ worktree: tmpDir } as any)
      expect(typeof server["permission.ask"]).toBe("function")
    })
  })
})
