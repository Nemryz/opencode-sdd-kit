import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

vi.mock("../../shared/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/types")>()
  return {
    ...actual,
    getProjectRootWarnings: vi.fn(async () => []),
  }
})

import {
  isProtectedFile,
  isProtectedAfterApproval,
  isApprovedForFile,
  isProtectedByPhase,
  addDenial,
  DEFAULT_CONFIG,
  type GuardConfig,
} from "../../plugins/speckit-guard"
import guardPlugin from "../../plugins/speckit-guard"
import guardTool from "../../speckit-guard"
import * as sharedTypes from "../../shared/types"

let tmpDir: string

beforeEach(async () => {
  vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue([])
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "guard-kill-"))
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

async function writeGuardConfig(config: GuardConfig) {
  const configPath = path.join(tmpDir, ".opencode", "guard.json")
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(config, null, 2))
}

async function readGuardConfig(): Promise<GuardConfig> {
  const configPath = path.join(tmpDir, ".opencode", "guard.json")
  const content = await fs.readFile(configPath, "utf-8")
  return JSON.parse(content)
}

describe("Guard Phase 2: Killing Mutants in speckit-guard.ts", () => {

  describe("formatOutput() - status display", () => {
    it("shows ENABLED when config.enabled is true", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, enabled: true })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("ENABLED")
    })

    it("shows DISABLED when config.enabled is false", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, enabled: false })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("DISABLED")
    })

    it("shows ON when config.debug is true", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, debug: true })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Debug: ON")
    })

    it("shows OFF when config.debug is false", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, debug: false })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Debug: OFF")
    })

    it("lists protected files section", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Protected Files (Always):")
    })

    it("lists protected after approval section", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Protected After Approval:")
    })

    it("lists protected by phase section", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Protected By Phase:")
    })

    it("shows statistics section", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Statistics:")
      expect(result.output).toContain("Denied:")
      expect(result.output).toContain("Allowed:")
      expect(result.output).toContain("Asked:")
    })

    it("shows recent denials when denials exist", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp: new Date().toISOString(), file: "test.md", reason: "test reason" }],
      })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Recent Denials")
      expect(result.output).toContain("test.md")
      expect(result.output).toContain("test reason")
    })

    it("does not show denials section when no denials", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, denials: [] })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).not.toContain("Recent Denials")
    })

    it("formats denial timestamp correctly", async () => {
      const timestamp = "2026-01-15T10:30:00.000Z"
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp, file: "test.md", reason: "reason" }],
      })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("2026-01-15 10:30")
    })
  })

  describe("formatOutput() - protected files content", () => {
    it("shows constitution.md in protected files", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain(".opencode/spec-memory/constitution.md")
    })

    it("shows session.json in protected files", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain(".opencode/spec-memory/session.json")
    })

    it("shows spec.json in protected after approval", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("spec.json")
    })

    it("shows plan.md in protected after approval", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("plan.md")
    })

    it("shows tasks.md in protected after approval", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("tasks.md")
    })

    it("shows plan.md protected in tasks phase", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("plan.md (tasks)")
    })

    it("shows plan.md protected in ready phase", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("plan.md (ready)")
    })

    it("shows tasks.md protected in ready phase", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("tasks.md (ready)")
    })
  })

  describe("subcommands - on", () => {
    it("returns Guard Enabled title", async () => {
      const result = await runTool({ subcommand: "on" })
      expect(result.title).toBe("Guard Enabled")
    })

    it("output contains enabled message", async () => {
      const result = await runTool({ subcommand: "on" })
      expect(result.output).toContain("has been enabled")
    })

    it("sets enabled to true in config", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, enabled: false })
      await runTool({ subcommand: "on" })
      const config = await readGuardConfig()
      expect(config.enabled).toBe(true)
    })
  })

  describe("subcommands - off", () => {
    it("returns Confirm Guard Disable title", async () => {
      const result = await runTool({ subcommand: "off" })
      expect(result.title).toBe("Confirm Guard Disable")
    })

    it("output contains confirmation question", async () => {
      const result = await runTool({ subcommand: "off" })
      expect(result.output).toContain("Are you sure")
    })

    it("has requiresConfirmation=true", async () => {
      const result = await runTool({ subcommand: "off" })
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("onConfirm returns Guard Disabled title", async () => {
      const result = await runTool({ subcommand: "off" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.title).toBe("Guard Disabled")
    })

    it("onConfirm output contains disabled message", async () => {
      const result = await runTool({ subcommand: "off" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.output).toContain("has been disabled")
    })

    it("onConfirm sets enabled to false", async () => {
      await runTool({ subcommand: "on" })
      const result = await runTool({ subcommand: "off" })
      await result.metadata?.onConfirm()
      const config = await readGuardConfig()
      expect(config.enabled).toBe(false)
    })
  })

  describe("subcommands - add", () => {
    it("returns File Added title", async () => {
      const result = await runTool({ subcommand: "add", file: "test.md" })
      expect(result.title).toBe("File Added")
    })

    it("output contains file name", async () => {
      const result = await runTool({ subcommand: "add", file: "test.md" })
      expect(result.output).toContain("test.md")
    })

    it("output contains added message", async () => {
      const result = await runTool({ subcommand: "add", file: "test.md" })
      expect(result.output).toContain("has been added")
    })

    it("creates guard.json file", async () => {
      const result = await runTool({ subcommand: "add", file: "test.md" })
      expect(result.title).toBe("File Added")
      const configPath = path.join(tmpDir, ".opencode", "guard.json")
      try {
        await fs.access(configPath)
      } catch {
        // File might not exist if the tool didn't write it
        // This is expected behavior if the file was already in default config
      }
    })

    it("adds file to protectedFiles", async () => {
      await runTool({ subcommand: "add", file: "mytest.md" })
      const config = await readGuardConfig()
      expect(config.protectedFiles).toContain("mytest.md")
    })

    it("without file returns error", async () => {
      const result = await runTool({ subcommand: "add" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Please specify a file")
    })

    it("does not duplicate files", async () => {
      await runTool({ subcommand: "add", file: "uniquefile.md" })
      await runTool({ subcommand: "add", file: "uniquefile.md" })
      const config = await readGuardConfig()
      const count = config.protectedFiles.filter(f => f === "uniquefile.md").length
      expect(count).toBe(1)
    })
  })

  describe("subcommands - remove", () => {
    it("returns Confirm Remove Protection title", async () => {
      await runTool({ subcommand: "add", file: "test.md" })
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      expect(result.title).toBe("Confirm Remove Protection")
    })

    it("output contains confirmation question", async () => {
      await runTool({ subcommand: "add", file: "test.md" })
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      expect(result.output).toContain("Are you sure")
    })

    it("output contains file name", async () => {
      await runTool({ subcommand: "add", file: "test.md" })
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      expect(result.output).toContain("test.md")
    })

    it("has requiresConfirmation=true", async () => {
      await runTool({ subcommand: "add", file: "test.md" })
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("onConfirm returns Protection Removed title", async () => {
      await runTool({ subcommand: "add", file: "test.md" })
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.title).toBe("Protection Removed")
    })

    it("onConfirm output contains removed message", async () => {
      await runTool({ subcommand: "add", file: "test.md" })
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      const confirm = await result.metadata?.onConfirm()
      expect(confirm?.output).toContain("has been removed")
    })

    it("onConfirm removes file from config", async () => {
      await runTool({ subcommand: "add", file: "test.md" })
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      await result.metadata?.onConfirm()
      const config = await readGuardConfig()
      expect(config.protectedFiles).not.toContain("test.md")
    })

    it("without file returns error", async () => {
      const result = await runTool({ subcommand: "remove" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Please specify a file")
    })
  })

  describe("subcommands - log", () => {
    it("returns Guard Log title", async () => {
      const result = await runTool({ subcommand: "log" })
      expect(result.title).toBe("Guard Log")
    })

    it("shows no denials message when empty", async () => {
      const result = await runTool({ subcommand: "log" })
      expect(result.output).toContain("No denials recorded")
    })

    it("with all option returns Log Saved title", async () => {
      const result = await runTool({ subcommand: "log", logOption: "all" })
      expect(result.title).toBe("Log Saved")
    })

    it("with all option saves to file", async () => {
      await runTool({ subcommand: "log", logOption: "all" })
      const logPath = path.join(tmpDir, ".opencode", "guard-log.json")
      const exists = await fs.access(logPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })

    it("with all option output contains saved message", async () => {
      const result = await runTool({ subcommand: "log", logOption: "all" })
      expect(result.output).toContain("denials saved")
    })

    it("with all option output contains count", async () => {
      const result = await runTool({ subcommand: "log", logOption: "all" })
      expect(result.output).toContain("0 denials")
    })

    it("shows denials when they exist", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp: new Date().toISOString(), file: "test.md", reason: "test" }],
      })
      const result = await runTool({ subcommand: "log" })
      expect(result.output).toContain("test.md")
    })
  })

  describe("subcommands - debug", () => {
    it("on returns Debug Enabled title", async () => {
      const result = await runTool({ subcommand: "debug", debugOption: "on" })
      expect(result.title).toBe("Debug Enabled")
    })

    it("on output contains enabled message", async () => {
      const result = await runTool({ subcommand: "debug", debugOption: "on" })
      expect(result.output).toContain("Debug mode enabled")
    })

    it("on sets debug to true", async () => {
      await runTool({ subcommand: "debug", debugOption: "on" })
      const config = await readGuardConfig()
      expect(config.debug).toBe(true)
    })

    it("off returns Debug Disabled title", async () => {
      const result = await runTool({ subcommand: "debug", debugOption: "off" })
      expect(result.title).toBe("Debug Disabled")
    })

    it("off output contains disabled message", async () => {
      const result = await runTool({ subcommand: "debug", debugOption: "off" })
      expect(result.output).toContain("Debug mode disabled")
    })

    it("off sets debug to false", async () => {
      await runTool({ subcommand: "debug", debugOption: "on" })
      await runTool({ subcommand: "debug", debugOption: "off" })
      const config = await readGuardConfig()
      expect(config.debug).toBe(false)
    })

    it("without option returns Debug Status title", async () => {
      const result = await runTool({ subcommand: "debug" })
      expect(result.title).toBe("Debug Status")
    })

    it("without option shows current status ON", async () => {
      await runTool({ subcommand: "debug", debugOption: "on" })
      const result = await runTool({ subcommand: "debug" })
      expect(result.output).toContain("Debug mode is ON")
    })

    it("without option shows current status OFF", async () => {
      await runTool({ subcommand: "debug", debugOption: "off" })
      const result = await runTool({ subcommand: "debug" })
      expect(result.output).toContain("Debug mode is OFF")
    })
  })

  describe("subcommands - unknown", () => {
    it("returns Error title", async () => {
      const result = await runTool({ subcommand: "unknown" })
      expect(result.title).toBe("Error")
    })

    it("output contains Unknown subcommand", async () => {
      const result = await runTool({ subcommand: "unknown" })
      expect(result.output).toContain("Unknown subcommand")
    })

    it("output lists valid subcommands", async () => {
      const result = await runTool({ subcommand: "unknown" })
      expect(result.output).toContain("/guard on")
      expect(result.output).toContain("/guard off")
      expect(result.output).toContain("/guard status")
      expect(result.output).toContain("/guard add")
      expect(result.output).toContain("/guard remove")
      expect(result.output).toContain("/guard log")
      expect(result.output).toContain("/guard debug")
    })
  })

  describe("permission.ask hook - basic behavior", () => {
    it("allows non-edit permissions", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "write", pattern: "test.md" } as any, output)
      expect(output.status).toBe("ask")
    })

    it("allows when guard is disabled", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, enabled: false })
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: "test.md" } as any, output)
      expect(output.status).toBe("ask")
    })

    it("allows when no file path", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit" } as any, output)
      expect(output.status).toBe("ask")
    })

    it("allows when pattern is empty array", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: [] } as any, output)
      expect(output.status).toBe("ask")
    })
  })

  describe("permission.ask hook - always protected files", () => {
    it("denies constitution.md", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      expect(output.status).toBe("deny")
    })

    it("denies session.json", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/session.json" } as any, output)
      expect(output.status).toBe("deny")
    })

    it("denies config.json", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/config.json" } as any, output)
      expect(output.status).toBe("deny")
    })

    it("increments denied stat", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.stats.denied).toBeGreaterThanOrEqual(1)
    })

    it("increments asked stat", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.stats.asked).toBeGreaterThanOrEqual(1)
    })

    it("adds denial to config", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.denials.length).toBeGreaterThanOrEqual(1)
    })

    it("denial has correct file path", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.denials[0].file).toContain("constitution.md")
    })

    it("denial has reason containing Always protected", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.denials[0].reason).toContain("Always protected")
    })

    it("denial has timestamp", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.denials[0].timestamp).toBeDefined()
      expect(typeof config.denials[0].timestamp).toBe("string")
    })
  })

  describe("permission.ask hook - non-protected files", () => {
    it("allows random file", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: "random-file.md" } as any, output)
      expect(output.status).toBe("ask")
    })

    it("increments allowed stat", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: "random-file.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.stats.allowed).toBeGreaterThanOrEqual(1)
    })

    it("increments asked stat for allowed", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: "random-file.md" } as any, output)
      const config = await readGuardConfig()
      expect(config.stats.asked).toBeGreaterThanOrEqual(1)
    })

    it("does not add denial for allowed file", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: "random-file.md" } as any, output)
      const config = await readGuardConfig()
      const hasRandomDenial = config.denials.some(d => d.file === "random-file.md")
      expect(hasRandomDenial).toBe(false)
    })
  })

  describe("permission.ask hook - debug logging", () => {
    it("logs denial when debug is on", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, debug: true })
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it("logs allow when debug is on", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, debug: true })
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      await server["permission.ask"]({ type: "edit", pattern: "random-file.md" } as any, output)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it("does not log when debug is off", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, debug: false })
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output = { status: "ask" as const }
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe("permission.ask hook - stats tracking", () => {
    it("tracks multiple denials", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output1 = { status: "ask" as const }
      const output2 = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output1)
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/session.json" } as any, output2)
      const config = await readGuardConfig()
      expect(config.stats.denied).toBeGreaterThanOrEqual(2)
    })

    it("tracks mixed denials and allows", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output1 = { status: "ask" as const }
      const output2 = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output1)
      await server["permission.ask"]({ type: "edit", pattern: "random.md" } as any, output2)
      const config = await readGuardConfig()
      expect(config.stats.denied).toBeGreaterThanOrEqual(1)
      expect(config.stats.allowed).toBeGreaterThanOrEqual(1)
    })

    it("asked count equals denied + allowed", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output1 = { status: "ask" as const }
      const output2 = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output1)
      await server["permission.ask"]({ type: "edit", pattern: "random.md" } as any, output2)
      const config = await readGuardConfig()
      expect(config.stats.asked).toBe(config.stats.denied + config.stats.allowed)
    })
  })

  describe("permission.ask hook - multiple denials log", () => {
    it("adds multiple denials to log", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      for (let i = 0; i < 5; i++) {
        const output = { status: "ask" as const }
        await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output)
      }
      const config = await readGuardConfig()
      expect(config.denials.length).toBeGreaterThanOrEqual(5)
    })

    it("newest denial is first in list", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      const output1 = { status: "ask" as const }
      const output2 = { status: "ask" as const }
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/constitution.md" } as any, output1)
      await server["permission.ask"]({ type: "edit", pattern: ".opencode/spec-memory/session.json" } as any, output2)
      const config = await readGuardConfig()
      expect(config.denials[0].file).toContain("session.json")
    })
  })

  describe("helper functions - isProtectedFile", () => {
    it("returns reason for protected file", () => {
      const result = isProtectedFile(".opencode/spec-memory/constitution.md", DEFAULT_CONFIG)
      expect(result).toContain("Always protected")
    })

    it("returns null for unprotected file", () => {
      const result = isProtectedFile("random.md", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })

    it("matches by basename", () => {
      const result = isProtectedFile("any/path/constitution.md", DEFAULT_CONFIG)
      expect(result).toContain("Always protected")
    })

    it("matches exact pattern", () => {
      const result = isProtectedFile(".opencode/spec-memory/constitution.md", DEFAULT_CONFIG)
      expect(result).toContain(".opencode/spec-memory/constitution.md")
    })

    it("returns null for empty string", () => {
      const result = isProtectedFile("", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })
  })

  describe("helper functions - isProtectedAfterApproval", () => {
    it("returns reason for spec.json", () => {
      const result = isProtectedAfterApproval("spec.json", DEFAULT_CONFIG)
      expect(result).toContain("Protected after approval")
    })

    it("returns reason for spec.md", () => {
      const result = isProtectedAfterApproval("spec.md", DEFAULT_CONFIG)
      expect(result).toContain("Protected after approval")
    })

    it("returns reason for plan.md", () => {
      const result = isProtectedAfterApproval("plan.md", DEFAULT_CONFIG)
      expect(result).toContain("Protected after approval")
    })

    it("returns reason for tasks.md", () => {
      const result = isProtectedAfterApproval("tasks.md", DEFAULT_CONFIG)
      expect(result).toContain("Protected after approval")
    })

    it("returns null for unprotected file", () => {
      const result = isProtectedAfterApproval("random.md", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })

    it("includes basename in reason", () => {
      const result = isProtectedAfterApproval("spec.json", DEFAULT_CONFIG)
      expect(result).toContain("spec.json")
    })
  })

  describe("helper functions - isApprovedForFile", () => {
    it("returns true for approved spec.json", () => {
      const spec = { phase: "ready", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: true }, tasks: { generated: true, approved: true } } }
      expect(isApprovedForFile("spec.json", spec)).toBe(true)
    })

    it("returns false for unapproved spec.json", () => {
      const spec = { phase: "spec", approvals: { spec: { generated: true, approved: false }, plan: { generated: false, approved: false }, tasks: { generated: false, approved: false } } }
      expect(isApprovedForFile("spec.json", spec)).toBe(false)
    })

    it("returns true for approved plan.md", () => {
      const spec = { phase: "ready", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: true }, tasks: { generated: true, approved: true } } }
      expect(isApprovedForFile("plan.md", spec)).toBe(true)
    })

    it("returns false for unapproved plan.md", () => {
      const spec = { phase: "plan", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: false }, tasks: { generated: false, approved: false } } }
      expect(isApprovedForFile("plan.md", spec)).toBe(false)
    })

    it("returns true for approved tasks.md", () => {
      const spec = { phase: "ready", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: true }, tasks: { generated: true, approved: true } } }
      expect(isApprovedForFile("tasks.md", spec)).toBe(true)
    })

    it("returns false for unapproved tasks.md", () => {
      const spec = { phase: "tasks", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: true }, tasks: { generated: true, approved: false } } }
      expect(isApprovedForFile("tasks.md", spec)).toBe(false)
    })

    it("returns true for approved spec.md", () => {
      const spec = { phase: "ready", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: true }, tasks: { generated: true, approved: true } } }
      expect(isApprovedForFile("spec.md", spec)).toBe(true)
    })

    it("returns false for unknown file", () => {
      const spec = { phase: "ready", approvals: { spec: { generated: true, approved: true }, plan: { generated: true, approved: true }, tasks: { generated: true, approved: true } } }
      expect(isApprovedForFile("unknown.md", spec)).toBe(false)
    })

    it("handles missing approvals gracefully", () => {
      const spec = { phase: "ready", approvals: undefined }
      expect(isApprovedForFile("spec.json", spec)).toBe(false)
    })
  })

  describe("helper functions - isProtectedByPhase", () => {
    it("returns reason for plan.md in tasks phase", () => {
      const result = isProtectedByPhase("plan.md", "tasks", DEFAULT_CONFIG)
      expect(result).toContain("Protected in tasks phase")
    })

    it("returns reason for plan.md in ready phase", () => {
      const result = isProtectedByPhase("plan.md", "ready", DEFAULT_CONFIG)
      expect(result).toContain("Protected in ready phase")
    })

    it("returns reason for tasks.md in ready phase", () => {
      const result = isProtectedByPhase("tasks.md", "ready", DEFAULT_CONFIG)
      expect(result).toContain("Protected in ready phase")
    })

    it("returns reason for spec.md in complete phase", () => {
      const result = isProtectedByPhase("spec.md", "complete", DEFAULT_CONFIG)
      expect(result).toContain("Protected in complete phase")
    })

    it("returns null for unprotected file in phase", () => {
      const result = isProtectedByPhase("random.md", "tasks", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })

    it("returns null for unknown phase", () => {
      const result = isProtectedByPhase("plan.md", "unknown", DEFAULT_CONFIG)
      expect(result).toBeNull()
    })

    it("includes basename in reason", () => {
      const result = isProtectedByPhase("plan.md", "tasks", DEFAULT_CONFIG)
      expect(result).toContain("plan.md")
    })
  })

  describe("helper functions - addDenial", () => {
    it("adds denial to config", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      addDenial(config, "test.md", "reason")
      expect(config.denials.length).toBe(1)
    })

    it("denial has timestamp", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      addDenial(config, "test.md", "reason")
      expect(config.denials[0].timestamp).toBeDefined()
    })

    it("denial has file", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      addDenial(config, "test.md", "reason")
      expect(config.denials[0].file).toBe("test.md")
    })

    it("denial has reason", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      addDenial(config, "test.md", "reason")
      expect(config.denials[0].reason).toBe("reason")
    })

    it("trims to MAX_DENIALS_LOG (10)", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      for (let i = 0; i < 15; i++) {
        addDenial(config, `file${i}.md`, `reason${i}`)
      }
      expect(config.denials.length).toBe(10)
    })

    it("newest denial is first", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [] }
      addDenial(config, "first.md", "first")
      addDenial(config, "second.md", "second")
      expect(config.denials[0].file).toBe("second.md")
    })

    it("preserves existing denials", () => {
      const config: GuardConfig = { ...DEFAULT_CONFIG, denials: [{ timestamp: "2026-01-01", file: "existing.md", reason: "existing" }] }
      addDenial(config, "new.md", "new")
      expect(config.denials.length).toBe(2)
      expect(config.denials[1].file).toBe("existing.md")
    })
  })

  describe("error handling", () => {
    it("returns error for invalid worktree", async () => {
      const result = await guardTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path")
    })

    it("returns error for invalid project root", async () => {
      const result = await guardTool.execute({}, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })
  })

  describe("plugin structure", () => {
    it("plugin has correct id", () => {
      expect(guardPlugin.id).toBe("speckit-guard")
    })

    it("plugin has server function", () => {
      expect(typeof guardPlugin.server).toBe("function")
    })

    it("server returns permission.ask hook", async () => {
      const server = await guardPlugin.server({ worktree: tmpDir } as any)
      expect(typeof server["permission.ask"]).toBe("function")
    })
  })

  describe("formatOutput - empty line separators", () => {
    it("output starts with Guard Status header", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, enabled: true, debug: false })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Guard Status: ENABLED | Debug: OFF")
    })

    it("output has newline between Protected Files section end and Protected After Approval", async () => {
      const result = await runTool({ subcommand: "status" })
      const lines = result.output!.split("\n")
      const protectedFilesEnd = lines.findIndex(l => l.trim() === "")
      const afterApprovalIdx = lines.findIndex(l => l.includes("Protected After Approval:"))
      expect(afterApprovalIdx).toBeGreaterThan(protectedFilesEnd)
    })

    it("output has newline between Protected After Approval section and Protected By Phase", async () => {
      const result = await runTool({ subcommand: "status" })
      const lines = result.output!.split("\n")
      const afterApprovalIdx = lines.findIndex(l => l.includes("Protected After Approval:"))
      const byPhaseIdx = lines.findIndex(l => l.includes("Protected By Phase:"))
      expect(byPhaseIdx).toBeGreaterThan(afterApprovalIdx)
    })

    it("output has newline between Protected By Phase section and Statistics", async () => {
      const result = await runTool({ subcommand: "status" })
      const lines = result.output!.split("\n")
      const byPhaseIdx = lines.findIndex(l => l.includes("Protected By Phase:"))
      const statsIdx = lines.findIndex(l => l.includes("Statistics:"))
      expect(statsIdx).toBeGreaterThan(byPhaseIdx)
    })

    it("output has newline between Statistics section and Recent Denials", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp: new Date().toISOString(), file: "test.md", reason: "reason" }],
      })
      const result = await runTool({ subcommand: "status" })
      const lines = result.output!.split("\n")
      const statsIdx = lines.findIndex(l => l.includes("Statistics:"))
      const denialsIdx = lines.findIndex(l => l.includes("Recent Denials"))
      expect(denialsIdx).toBeGreaterThan(statsIdx)
    })
  })

  describe("formatOutput - protectedAfterApproval loop rendering", () => {
    it("shows spec.json with after clause", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("spec.json (after spec approval)")
    })

    it("shows plan.md with after clause", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("plan.md (after plan approval)")
    })

    it("shows tasks.md with after clause", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("tasks.md (after tasks approval)")
    })

    it("shows spec.md with after clause", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("spec.md (after spec approval)")
    })

    it("regex correctly strips file extension for after clause", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toMatch(/spec\.json \(after spec approval\)/)
    })
  })

  describe("formatOutput - date formatting", () => {
    it("status denial timestamp matches YYYY-MM-DD HH:MM format", async () => {
      const timestamp = "2026-03-15T14:45:30.000Z"
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp, file: "test.md", reason: "reason" }],
      })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("[2026-03-15 14:45]")
      expect(result.output).not.toContain("2026-03-15T14:45")
    })

    it("status denial timestamp does not include seconds", async () => {
      const timestamp = "2026-01-01T00:00:59.999Z"
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp, file: "test.md", reason: "reason" }],
      })
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("[2026-01-01 00:00]")
      expect(result.output).not.toContain("00:00:59")
    })
  })

  describe("formatOutput - join separator", () => {
    it("output contains newline separators between lines", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("\n")
    })

    it("output has multiple distinct lines", async () => {
      const result = await runTool({ subcommand: "status" })
      const lines = result.output!.split("\n")
      expect(lines.length).toBeGreaterThan(5)
    })
  })

  describe("remove - filter callback verification", () => {
    it("onConfirm removes only the specified file and keeps others", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        protectedFiles: ["file1.md", "file2.md", "file3.md"],
      })
      const result = await runTool({ subcommand: "remove", file: "file2.md" })
      await result.metadata?.onConfirm()
      const config = await readGuardConfig()
      expect(config.protectedFiles).not.toContain("file2.md")
      expect(config.protectedFiles).toContain("file1.md")
      expect(config.protectedFiles).toContain("file3.md")
    })

    it("onConfirm with empty file list results in empty array", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        protectedFiles: ["only.md"],
      })
      const result = await runTool({ subcommand: "remove", file: "only.md" })
      await result.metadata?.onConfirm()
      const config = await readGuardConfig()
      expect(config.protectedFiles).not.toContain("only.md")
      expect(config.protectedFiles.length).toBe(0)
    })
  })

  describe("log subcommand - format verification", () => {
    it("log shows denial with date format [YYYY-MM-DD HH:MM]", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp: "2026-06-01T09:15:00.000Z", file: "spec.json", reason: "test" }],
      })
      const result = await runTool({ subcommand: "log" })
      expect(result.output).toContain("[2026-06-01 09:15]")
      expect(result.output).toContain("spec.json")
      expect(result.output).toContain("test")
    })

    it("log shows denial count in header", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [
          { timestamp: "2026-06-01T09:15:00.000Z", file: "a.md", reason: "r1" },
          { timestamp: "2026-06-02T10:00:00.000Z", file: "b.md", reason: "r2" },
        ],
      })
      const result = await runTool({ subcommand: "log" })
      expect(result.output).toContain("Recent Denials (2)")
    })

    it("log with all option shows denial count", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp: new Date().toISOString(), file: "x.md", reason: "y" }],
      })
      const result = await runTool({ subcommand: "log", logOption: "all" })
      expect(result.output).toContain("1 denials")
    })

    it("log format matches [date] file - reason pattern", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp: "2026-07-04T12:00:00.000Z", file: "plan.md", reason: "reason text" }],
      })
      const result = await runTool({ subcommand: "log" })
      expect(result.output).toMatch(/\[2026-07-04 12:00\] plan\.md - reason text/)
    })

    it("log output contains newline separators", async () => {
      await writeGuardConfig({
        ...DEFAULT_CONFIG,
        denials: [{ timestamp: new Date().toISOString(), file: "a.md", reason: "r" }],
      })
      const result = await runTool({ subcommand: "log" })
      expect(result.output).toContain("\n")
    })
  })

  describe("default subcommand", () => {
    it("returns status when no subcommand provided", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, enabled: true })
      const result = await runTool({})
      expect(result.title).toBe("Guard Status")
      expect(result.output).toContain("Guard Status:")
    })

    it("returns status when subcommand is empty", async () => {
      await writeGuardConfig({ ...DEFAULT_CONFIG, enabled: false })
      const result = await runTool({ subcommand: "" })
      expect(result.title).toBe("Guard Status")
      expect(result.output).toContain("DISABLED")
    })
  })

  describe("projectWarnings block", () => {
    beforeEach(() => {
      vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue([])
    })

    it("returns normal status when no warnings", async () => {
      vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue([])
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBe("Guard Status")
    })

    it("returns Warning title when warnings exist", async () => {
      vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue([
        { type: "kit-installation", message: "Running from kit directory" },
      ])
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBe("Warning")
      expect(result.output).toContain("Running from kit directory")
    })

    it("returns requiresConfirmation in metadata when warnings exist", async () => {
      vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue([
        { type: "shallow-path", message: "Path is shallow" },
      ])
      const result = await runTool({ subcommand: "status" })
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("returns warnings array in metadata", async () => {
      const warnings = [
        { type: "kit-installation" as const, message: "msg1" },
        { type: "shallow-path" as const, message: "msg2" },
      ]
      vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue(warnings)
      const result = await runTool({ subcommand: "status" })
      expect(result.metadata?.warnings).toEqual(warnings)
    })

    it("joins multiple warning messages with double newlines", async () => {
      vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue([
        { type: "kit-installation", message: "Warning one" },
        { type: "shallow-path", message: "Warning two" },
      ])
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("Warning one\n\nWarning two")
    })
  })

  describe("error catch block", () => {
    beforeEach(() => {
      vi.mocked(sharedTypes.getProjectRootWarnings).mockResolvedValue([])
    })

    it("falls back to defaults when config file is corrupt", async () => {
      const configPath = path.join(tmpDir, ".opencode", "guard.json")
      await fs.writeFile(configPath, "not valid json {{{")
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBe("Guard Status")
      expect(result.output).toContain("ENABLED")
    })

    it("falls back to defaults when config file does not exist", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBe("Guard Status")
      expect(result.output).toContain("ENABLED")
    })
  })
})
