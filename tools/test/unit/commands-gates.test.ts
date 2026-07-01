import { describe, it, expect, beforeAll } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const COMMANDS_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "commands")

async function readCommand(name: string): Promise<string> {
  return fs.readFile(path.join(COMMANDS_DIR, name), "utf-8")
}

describe("B-1: audit.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("audit.md") })

  it("has a Pre-validation section", () => {
    expect(content).toMatch(/Pre-validation/i)
  })

  it("calls speckit-validate", () => {
    expect(content).toMatch(/speckit-validate/)
  })

  it("checks that features exist before running audit", () => {
    expect(content).toMatch(/features?\s*(exist|found|detected)/i)
  })
})

describe("B-2: clean.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("clean.md") })

  it("has a Pre-validation section", () => {
    expect(content).toMatch(/Pre-validation/i)
  })

  it("calls speckit-validate", () => {
    expect(content).toMatch(/speckit-validate/)
  })

  it("has $ARGUMENTS before the Task block", () => {
    const argsIdx = content.indexOf("$ARGUMENTS")
    const taskIdx = content.indexOf("## Task")
    expect(argsIdx).not.toBe(-1)
    expect(argsIdx).toBeLessThan(taskIdx)
  })
})

describe("B-3: review.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("review.md") })

  it("calls speckit-validate with command", () => {
    expect(content).toMatch(/speckit-validate/)
    expect(content).toMatch(/command.*review/)
  })

  it("checks spec.json approvals before proceeding", () => {
    expect(content).toMatch(/approvals?\.\w+\.(approved|generated)/i)
  })
})

describe("B-4: spec.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("spec.md") })

  it("calls speckit-validate", () => {
    expect(content).toMatch(/speckit-validate/)
  })

  it("reads spec.json to check existing phase", () => {
    expect(content).toMatch(/spec\.json/)
  })

  it("warns before overwriting existing spec", () => {
    expect(content).toMatch(/warn|overwrite|already\s+exists/i)
  })
})
