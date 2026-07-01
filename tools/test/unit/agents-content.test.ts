import { describe, it, expect, beforeAll } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"

const AGENTS_PATH = path.resolve(import.meta.dirname, "..", "..", "..", "AGENTS.md")
const COMMANDS_DIR = path.resolve(AGENTS_PATH, "..", "commands")
const TOOLS_DIR = path.resolve(AGENTS_PATH, "..", "tools")
const SKILLS_DIR = path.resolve(AGENTS_PATH, "..", "skills")

describe("AGENTS.md completeness", () => {
  let content: string
  let commandFiles: string[]
  let toolFiles: string[]
  let skillDirs: string[]

  beforeAll(async () => {
    content = await fs.readFile(AGENTS_PATH, "utf-8")
    commandFiles = (await fs.readdir(COMMANDS_DIR)).filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""))
    toolFiles = (await fs.readdir(TOOLS_DIR)).filter(f => f.startsWith("speckit-") && f.endsWith(".ts")).map(f => f.replace(".ts", ""))
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true })
    skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name)
  })

  it("documents all commands in the Commands section", () => {
    const commandsSection = content.slice(content.indexOf("## Commands"), content.indexOf("---", content.indexOf("## Commands")))
    for (const cmd of commandFiles) {
      if (cmd === "review") continue // /review is exempt (discussed separately)
      expect(commandsSection).toMatch(new RegExp("/" + cmd, "i"))
    }
  })

  it("documents all tools in the Available Tools table", () => {
    const toolsSection = content.slice(content.indexOf("## Available Tools"), content.indexOf("## Constitution Template"))
    for (const tool of toolFiles) {
      expect(toolsSection).toMatch(new RegExp("`" + tool + "`"))
    }
  })

  it("documents all skills in the Available Skills table", () => {
    const skillsSection = content.slice(content.indexOf("## Available Skills"), content.indexOf("## Available Tools"))
    const skillDirsClean = skillDirs.filter(d => d !== "rules")
    for (const skill of skillDirsClean) {
      expect(skillsSection).toMatch(new RegExp("`" + skill + "`"))
    }
  })

  it("mentions all tools in the Custom Tool Error Handling section", () => {
    const customSection = content.slice(content.indexOf("## Custom Tool Error Handling"), content.indexOf("### If a tool crashes opencode"))
    for (const tool of toolFiles) {
      expect(customSection).toMatch(new RegExp("`" + tool + "`"))
    }
  })

  it("has a Commands section with /audit documented", () => {
    expect(content).toMatch(/\/audit/)
  })

  it("includes speckit-complexity in Available Tools", () => {
    expect(content).toMatch(/speckit-complexity/)
  })

  it("includes speckit-audit in Available Tools", () => {
    expect(content).toMatch(/speckit-audit/)
  })
})
