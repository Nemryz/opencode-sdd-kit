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

  it("does not use local file paths in the plugin array", () => {
    const plugin = config.plugin
    if (plugin === undefined) return
    expect(Array.isArray(plugin)).toBe(true)
    for (const entry of plugin) {
      expect(typeof entry).toBe("string")
      expect(entry).not.toMatch(/^[.~]|[\\/]/)
    }
  })
})
