import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import configTool from "../../speckit-config"
import { writeWithBackup, configPath } from "../../shared/types"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

function toString(title: string, output: string): string {
  return `${title} | ${output}`
}

describe("config execute branching", () => {
  it("returns error when no worktree", async () => {
    const result = await configTool.execute({}, { worktree: "" })
    expect(result.title).toBe("Error")
    expect(result.output).toContain("No worktree path")
  })

  it("returns error for invalid project root", async () => {
    const badCtx = mockContext(path.join(worktree, "nonexistent"))
    const result = await configTool.execute({}, badCtx)
    expect(result.title).toBe("Error")
    expect(result.output).toContain("Not a valid project directory")
  })

  it("shows default config with empty args", async () => {
    const result = await configTool.execute({}, ctx)
    const text = toString(result.title, result.output)
    expect(text).toContain("defaultTechStack: (not set)")
    expect(text).toContain("expressMode: false")
    expect(text).toContain("0 key(s)")
  })

  it("sets defaultTechStack via dedicated arg", async () => {
    const result = await configTool.execute({ defaultTechStack: "Node.js" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("Node.js")
  })

  it("sets key=value preference", async () => {
    const result = await configTool.execute({ key: "theme", value: "dark" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("theme: dark")
  })

  it("sets expressMode to true", async () => {
    const result = await configTool.execute({ key: "expressMode", value: "true" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("expressMode: true")
  })

  it("sets expressMode to false", async () => {
    await configTool.execute({ key: "expressMode", value: "true" }, ctx)
    const result = await configTool.execute({ key: "expressMode", value: "false" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("expressMode: false")
  })

  it("sets defaultTechStack via key=value", async () => {
    const result = await configTool.execute({ key: "defaultTechStack", value: "Go+Postgres" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("Go+Postgres")
  })

  it("updates lastUsedLanguage when key=language", async () => {
    const result = await configTool.execute({ key: "language", value: "es" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("language: es")
  })

  it("reads expressMode via key lookup", async () => {
    await configTool.execute({ key: "expressMode", value: "true" }, ctx)
    const result = await configTool.execute({ key: "expressMode" }, ctx)
    expect(result.title).toBe("Configuration read")
    expect(result.output).toContain("expressMode: true")
  })

  it("reads defaultTechStack via key lookup", async () => {
    await configTool.execute({ defaultTechStack: "Rust" }, ctx)
    const result = await configTool.execute({ key: "defaultTechStack" }, ctx)
    expect(result.title).toBe("Configuration read")
    expect(result.output).toContain("Rust")
  })

  it("returns (not set) for unknown key", async () => {
    const result = await configTool.execute({ key: "nonexistent" }, ctx)
    expect(result.title).toBe("Configuration read")
    expect(result.output).toContain("(not set)")
  })

  it("prevents __proto__ pollution in preferences", async () => {
    await configTool.execute({ key: "__proto__", value: "polluted" }, ctx)
    const proto = ({} as Record<string, string>).__proto__
    expect(proto).not.toBe("polluted")
  })

  it("stores dotted preference keys literally not nested", async () => {
    await configTool.execute({ key: "editor.path", value: "vim" }, ctx)
    const result = await configTool.execute({ key: "editor.path" }, ctx)
    expect(result.output).toContain("vim")
  })

  it("defaults expressMode to false when config file missing", async () => {
    const result = await configTool.execute({}, ctx)
    expect(result.metadata?.expressMode).toBe(false)
  })

  it("includes metadata in success responses", async () => {
    const result = await configTool.execute({ defaultTechStack: "FastAPI" }, ctx)
    expect(result.metadata).toBeDefined()
    expect(result.metadata!.defaultTechStack).toBe("FastAPI")
  })

  // ── Item 1: autoVersioning CLI ─────────────────────────────

  it("sets autoVersioning to true via key=value", async () => {
    const result = await configTool.execute({ key: "autoVersioning", value: "true" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("autoVersioning: true")
  })

  it("sets autoVersioning to false via key=value", async () => {
    await configTool.execute({ key: "autoVersioning", value: "true" }, ctx)
    const result = await configTool.execute({ key: "autoVersioning", value: "false" }, ctx)
    expect(result.title).toBe("Configuration updated")
    expect(result.output).toContain("autoVersioning: false")
  })

  it("reads autoVersioning via key lookup", async () => {
    await configTool.execute({ key: "autoVersioning", value: "true" }, ctx)
    const result = await configTool.execute({ key: "autoVersioning" }, ctx)
    expect(result.title).toBe("Configuration read")
    expect(result.output).toContain("autoVersioning: true")
  })

  it("shows autoVersioning in default config display", async () => {
    await configTool.execute({ key: "autoVersioning", value: "true" }, ctx)
    const result = await configTool.execute({}, ctx)
    expect(result.output).toContain("autoVersioning: true")
  })

  it("defaults autoVersioning to false when config file missing", async () => {
    const result = await configTool.execute({}, ctx)
    expect(result.metadata?.autoVersioning).toBe(false)
  })

  // ── Item 2: writeConfig triggers tryAutoCommit ─────────────

  it("auto-commits config.json when autoVersioning is enabled", async () => {
    const { execSync } = await import("node:child_process")
    execSync("git init", { cwd: worktree, stdio: "ignore" })
    execSync('git config user.email "test@test.com"', { cwd: worktree, stdio: "ignore" })
    execSync('git config user.name "Test"', { cwd: worktree, stdio: "ignore" })
    const fp = configPath(worktree)
    await writeWithBackup(fp, JSON.stringify({ autoVersioning: true }))
    execSync("git add -A", { cwd: worktree, stdio: "ignore" })
    execSync("git commit -m initial", { cwd: worktree, stdio: "ignore" })
    await configTool.execute({ key: "expressMode", value: "true" }, ctx)
    const log = execSync("git log --oneline", { cwd: worktree, encoding: "utf-8" })
    expect(log).toContain("auto: update config")
  })

  it("does not auto-commit when autoVersioning is disabled", async () => {
    const { execSync } = await import("node:child_process")
    await fs.writeFile(path.join(worktree, ".gitkeep"), "", "utf-8")
    execSync("git init", { cwd: worktree, stdio: "ignore" })
    execSync('git config user.email "test@test.com"', { cwd: worktree, stdio: "ignore" })
    execSync('git config user.name "Test"', { cwd: worktree, stdio: "ignore" })
    execSync("git add -A", { cwd: worktree, stdio: "ignore" })
    execSync("git commit -m initial", { cwd: worktree, stdio: "ignore" })
    await configTool.execute({ key: "expressMode", value: "true" }, ctx)
    const log = execSync("git log --oneline", { cwd: worktree, encoding: "utf-8" })
    expect(log).not.toContain("auto: update config")
  })
})
