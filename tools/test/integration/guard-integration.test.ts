import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import guardTool from "../../speckit-guard"

describe("speckit-guard integration", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "guard-integration-"))
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

  describe("status subcommand", () => {
    it("returns guard status", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.title).toBe("Guard Status")
      expect(result.output).toContain("Guard Status:")
      expect(result.output).toContain("Protected Files")
      expect(result.output).toContain("Statistics")
    })

    it("shows enabled by default", async () => {
      const result = await runTool({ subcommand: "status" })
      expect(result.output).toContain("ENABLED")
    })
  })

  describe("on subcommand", () => {
    it("enables guard", async () => {
      const result = await runTool({ subcommand: "on" })
      expect(result.title).toBe("Guard Enabled")
      expect(result.output).toContain("enabled")
    })
  })

  describe("off subcommand", () => {
    it("returns confirmation", async () => {
      const result = await runTool({ subcommand: "off" })
      expect(result.title).toBe("Confirm Guard Disable")
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("executes onConfirm", async () => {
      const result = await runTool({ subcommand: "off" })
      const confirmResult = await result.metadata?.onConfirm()
      expect(confirmResult?.title).toBe("Guard Disabled")
    })
  })

  describe("add subcommand", () => {
    it("adds file to protection", async () => {
      const result = await runTool({ subcommand: "add", file: "test.md" })
      expect(result.title).toBe("File Added")
      expect(result.output).toContain("test.md")
    })

    it("returns error without file", async () => {
      const result = await runTool({ subcommand: "add" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("specify a file")
    })
  })

  describe("remove subcommand", () => {
    it("returns confirmation", async () => {
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      expect(result.title).toBe("Confirm Remove Protection")
      expect(result.metadata?.requiresConfirmation).toBe(true)
    })

    it("executes onConfirm", async () => {
      const result = await runTool({ subcommand: "remove", file: "test.md" })
      const confirmResult = await result.metadata?.onConfirm()
      expect(confirmResult?.title).toBe("Protection Removed")
    })

    it("returns error without file", async () => {
      const result = await runTool({ subcommand: "remove" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("specify a file")
    })
  })

  describe("log subcommand", () => {
    it("shows empty log", async () => {
      const result = await runTool({ subcommand: "log" })
      expect(result.title).toBe("Guard Log")
      expect(result.output).toContain("No denials")
    })
  })

  describe("debug subcommand", () => {
    it("shows debug status", async () => {
      const result = await runTool({ subcommand: "debug" })
      expect(result.title).toBe("Debug Status")
      expect(result.output).toContain("OFF")
    })

    it("enables debug", async () => {
      const result = await runTool({ subcommand: "debug", debugOption: "on" })
      expect(result.title).toBe("Debug Enabled")
    })

    it("disables debug", async () => {
      const result = await runTool({ subcommand: "debug", debugOption: "off" })
      expect(result.title).toBe("Debug Disabled")
    })
  })

  describe("error handling", () => {
    it("returns error for invalid worktree", async () => {
      const result = await guardTool.execute({}, { worktree: undefined, sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("No worktree path provided")
    })

    it("returns error for invalid project root", async () => {
      const result = await guardTool.execute({}, { worktree: "/nonexistent", sessionID: "test", callID: "test" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Not a valid project directory")
    })

    it("returns error for unknown subcommand", async () => {
      const result = await runTool({ subcommand: "unknown" })
      expect(result.title).toBe("Error")
      expect(result.output).toContain("Unknown subcommand")
    })
  })
})
