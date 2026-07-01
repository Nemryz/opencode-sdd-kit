import { describe, it, expect, beforeAll } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const SKILL_PATH = path.resolve(
  import.meta.dirname, "..", "..", "..",
  "skills", "speckit-reviewer", "SKILL.md",
)

describe("speckit-reviewer SKILL.md content", () => {
  let content: string

  beforeAll(async () => {
    content = await fs.readFile(SKILL_PATH, "utf-8")
  })

  it("references shared rules from skills/rules/", () => {
    const rulesRef = content.match(/skills\/rules\/[\w-]+\.md/g)
    expect(rulesRef).not.toBeNull()
    expect(rulesRef!.length).toBeGreaterThanOrEqual(1)
  })

  it("uses @mention syntax for sub-agents", () => {
    expect(content).toMatch(/@[\w-]+/)
  })

  it("mentions parallel sub-agent dispatch for artifact review", () => {
    const hasParallel = /parallel|sub-agent|dispatch/i.test(content)
    const hasPerArtifact = /per artifact|each artifact|review.*parallel/i.test(content)
    expect(hasParallel || hasPerArtifact).toBe(true)
  })
})
