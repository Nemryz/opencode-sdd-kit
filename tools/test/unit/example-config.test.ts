import { describe, it, expect, beforeAll } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const EXAMPLE_PATH = path.resolve(import.meta.dirname, "..", "..", "..", "opencode.jsonc.example")

describe("opencode.jsonc.example approval gate", () => {
  let config: Record<string, any>

  beforeAll(async () => {
    config = JSON.parse(await fs.readFile(EXAMPLE_PATH, "utf-8"))
  })

  it("requires user confirmation for speckit-approve", () => {
    expect(config.permission?.["speckit-approve"]).toBe("ask")
  })

  it("keeps the external directory permission", () => {
    expect(config.permission?.external_directory?.["~/.config/opencode/**"]).toBe("allow")
  })

  it("registers the runtime plugins", () => {
    expect(Array.isArray(config.plugin)).toBe(true)
    expect(config.plugin.length).toBeGreaterThanOrEqual(2)
  })
})
