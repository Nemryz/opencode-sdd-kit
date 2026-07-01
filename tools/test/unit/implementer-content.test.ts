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

  it("has a proposal template with Phase Plan and Boundary Map", () => {
    expect(content).toMatch(/Phase Plan/)
    expect(content).toMatch(/Boundary Map/)
    expect(content).toMatch(/Confirmation/)
  })

  it("waits for user confirmation before proceeding", () => {
    expect(content).toMatch(/wait.*user confirmation|confirmation.*proceed/i)
  })

  it("references shared rules from skills/rules/", () => {
    const rulesRef = content.match(/skills\/rules\/[\w-]+\.md/g)
    expect(rulesRef).not.toBeNull()
    expect(rulesRef!.length).toBeGreaterThanOrEqual(1)
  })

  it("references design-principles.md in shared rules", () => {
    expect(content).toMatch(/design-principles\.md/)
  })

  it("references tasks-generation.md in shared rules", () => {
    expect(content).toMatch(/tasks-generation\.md/)
  })

  it("uses boundary annotation format", () => {
    expect(content).toMatch(/_Boundary:/)
  })

  it("uses _Boundary: in sub-agent dispatch section", () => {
    expect(content).toMatch(/Boundary.*dispatch|dispatch.*Boundary/i)
  })

  it("uses @mention syntax for sub-agents", () => {
    expect(content).toMatch(/@[\w-]+/)
  })

  it("references @speckit-implementer, @speckit-reviewer, @explore sub-agents", () => {
    expect(content).toMatch(/@speckit-implementer/)
    expect(content).toMatch(/@speckit-reviewer/)
    expect(content).toMatch(/@explore/)
  })

  it("describes sub-agent dispatch for complex tasks", () => {
    expect(content).toMatch(/sub-agent.*dispatch|dispatch.*sub-agent/i)
  })

  it("loads domain-map.md in context step", () => {
    expect(content).toMatch(/domain-map\.md/)
  })

  it("loads constitution.md in context step", () => {
    expect(content).toMatch(/constitution\.md/)
  })

  it("loads steering context in context step", () => {
    expect(content).toMatch(/steering/i)
  })

  it("has a quality checklist section", () => {
    expect(content).toMatch(/- \[ \]/)
  })

  it("quality checklist includes proposal, boundary, @mention, rules, TDD items", () => {
    expect(content).toMatch(/proposal/i)
    expect(content).toMatch(/Boundary/)
    expect(content).toMatch(/@mention/)
    expect(content).toMatch(/skills\/rules/)
    expect(content).toMatch(/TDD|RED.*GREEN.*REFACTOR/i)
  })

  it("has a dedicated Reference section", () => {
    expect(content).toMatch(/## Reference/)
  })

  it("Reference section includes paths for tasks, plan, spec, constitution, rules", () => {
    const refStart = content.indexOf("## Reference")
    const refBlock = content.slice(refStart)
    expect(refBlock).toMatch(/tasks\.md/)
    expect(refBlock).toMatch(/plan\.md/)
    expect(refBlock).toMatch(/spec\.md/)
    expect(refBlock).toMatch(/constitution\.md/)
    expect(refBlock).toMatch(/skills\/rules\//)
  })

  it("has error handling sections for blocked tasks, test failures, boundary overlap", () => {
    expect(content).toMatch(/blocked/i)
    expect(content).toMatch(/Boundary overlap/i)
    expect(content).toMatch(/Test.*fail/i)
  })

  it("caps debug rounds at 2 per task", () => {
    expect(content).toMatch(/2.*debug|debug.*2|max.*2/i)
  })

  it("has a Verification section at the end", () => {
    expect(content).toMatch(/## Verification/)
  })

  it("has metadata with shared-rules in frontmatter", () => {
    expect(content).toMatch(/shared-rules:/)
  })
})
