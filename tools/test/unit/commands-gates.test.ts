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

describe("B-5: plan.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("plan.md") })

  it("has a Pre-validation section", () => {
    expect(content).toMatch(/Pre-validation/i)
  })

  it("calls speckit-validate with command", () => {
    expect(content).toMatch(/speckit-validate/)
    expect(content).toMatch(/command.*plan/)
  })

  it("checks metadata.artifacts.spec before proceeding", () => {
    expect(content).toMatch(/artifacts\.spec/)
    expect(content).toMatch(/false/)
  })

  it("checks spec.json approvals.spec.approved before planning", () => {
    expect(content).toMatch(/approvals\.spec\.approved/)
  })
})

describe("B-6: tasks.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("tasks.md") })

  it("has a Pre-validation section", () => {
    expect(content).toMatch(/Pre-validation/i)
  })

  it("calls speckit-validate with command", () => {
    expect(content).toMatch(/speckit-validate/)
    expect(content).toMatch(/command.*tasks/)
  })

  it("checks that spec and plan exist before decomposing", () => {
    expect(content).toMatch(/artifacts\.spec/)
    expect(content).toMatch(/artifacts\.plan/)
  })

  it("checks spec.json approvals.plan.approved before proceeding", () => {
    expect(content).toMatch(/approvals\.plan\.approved/)
  })
})

describe("B-7: impl.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("impl.md") })

  it("has a Pre-validation section", () => {
    expect(content).toMatch(/Pre-validation/i)
  })

  it("calls speckit-validate with command", () => {
    expect(content).toMatch(/speckit-validate/)
    expect(content).toMatch(/command.*impl/)
  })

  it("checks that spec, plan, and tasks all exist", () => {
    expect(content).toMatch(/artifacts\.spec/)
    expect(content).toMatch(/artifacts\.plan/)
    expect(content).toMatch(/artifacts\.tasks/)
  })

  it("checks spec.json approvals.tasks.approved before implementing", () => {
    expect(content).toMatch(/approvals\.tasks\.approved/)
  })
})

describe("B-8: status.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("status.md") })

  it("calls speckit-status tool", () => {
    expect(content).toMatch(/speckit-status/)
  })

  it("suggests /spec if no features exist", () => {
    expect(content).toMatch(/\/spec/)
    expect(content).toMatch(/no features/i)
  })

  it("reports next step based on current phase", () => {
    expect(content).toMatch(/next step|next command|next:/i)
  })
})

describe("B-9: steering.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("steering.md") })

  it("reads the steering directory to check existing docs", () => {
    expect(content).toMatch(/\.opencode\/steering\//)
  })

  it("calls speckit-scaffold with steering template", () => {
    expect(content).toMatch(/speckit-scaffold/)
    expect(content).toMatch(/template.*steering/)
  })

  it("has $ARGUMENTS for user input", () => {
    expect(content).toMatch(/\$ARGUMENTS/)
  })
})

describe("B-10: config.md phase gate", () => {
  let content: string
  beforeAll(async () => { content = await readCommand("config.md") })

  it("calls speckit-config tool", () => {
    expect(content).toMatch(/speckit-config/)
  })

  it("parses $ARGUMENTS for defaultTechStack", () => {
    expect(content).toMatch(/defaultTechStack/)
  })

  it("parses $ARGUMENTS for key=value syntax", () => {
    expect(content).toMatch(/key=.*value=/)
  })
})
