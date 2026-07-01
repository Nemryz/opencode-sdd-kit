import { describe, it, expect, beforeAll } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const SKILL_PATH = path.resolve(import.meta.dirname, "..", "..", "..", "skills", "speckit-implementer", "SKILL.md")

describe("speckit-implementer SKILL.md content", () => {
  let content: string

  beforeAll(async () => {
    content = await fs.readFile(SKILL_PATH, "utf-8")
  })

  it("has a conversational proposal section before execution", () => {
    const proposalMatch = content.match(/proposal/i)
    const executeIndex = content.indexOf("Step 3: Execute Tasks")
    expect(proposalMatch).not.toBeNull()
    expect(proposalMatch!.index).toBeLessThan(executeIndex)
  })

  it("references shared rules from skills/rules/", () => {
    const rulesRef = content.match(/skills\/rules\/[\w-]+\.md/g)
    expect(rulesRef).not.toBeNull()
    expect(rulesRef!.length).toBeGreaterThanOrEqual(1)
  })

  it("uses boundary annotation format", () => {
    expect(content).toMatch(/_Boundary:/)
  })

  it("uses @mention syntax for sub-agents", () => {
    expect(content).toMatch(/@[\w-]+/)
  })
})
