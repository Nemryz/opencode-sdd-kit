import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import statusTool from "../../speckit-status"
import auditTool from "../../speckit-audit"
import healthTool from "../../speckit-health"
import scaffoldTool from "../../speckit-scaffold"
import { mockContext } from "../helpers/setup"

let base: string
let sysRoot: string

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "gate-test-"))
  sysRoot = path.join(base, "bin")
  await fs.mkdir(path.join(sysRoot, ".opencode", "spec-memory"), { recursive: true })
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

describe("project-root warning gate", () => {
  it("status warns without confirmed and includes the retry hint", async () => {
    const result = await statusTool.execute({}, mockContext(sysRoot))
    expect(result.title).toBe("Warning")
    expect(result.output).toContain("system directory")
    expect(result.output).toContain("confirmed: true")
    expect(result.metadata?.requiresConfirmation).toBe(true)
  })

  it("status proceeds with confirmed: true", async () => {
    const result = await statusTool.execute({ confirmed: true }, mockContext(sysRoot))
    expect(result.title).not.toBe("Warning")
  })

  it("audit proceeds with confirmed: true", async () => {
    const result = await auditTool.execute({ confirmed: true }, mockContext(sysRoot))
    expect(result.title).not.toBe("Warning")
  })

  it("health proceeds with confirmed: true", async () => {
    const result = await healthTool.execute({ confirmed: true }, mockContext(sysRoot))
    expect(result.title).not.toBe("Warning")
  })

  it("scaffold proceeds with confirmed: true and creates the feature", async () => {
    const result = await scaffoldTool.execute(
      { featureName: "Gate Test", template: "spec", confirmed: true },
      mockContext(sysRoot),
    )
    expect(result.title).not.toBe("Warning")
    const dirs = await fs.readdir(path.join(sysRoot, "specs")).catch(() => [] as string[])
    expect(dirs.some((d) => d.includes("gate-test"))).toBe(true)
  })
})
