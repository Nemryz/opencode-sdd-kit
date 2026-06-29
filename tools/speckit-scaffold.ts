import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"

const TEMPLATES_DIR = path.join(os.homedir(), ".config", "opencode", "templates")

interface ApprovalState {
  generated: boolean
  approved: boolean
}

interface SpecJson {
  feature_name: string
  feature_number: number
  created_at: string
  updated_at: string
  phase: "spec" | "plan" | "tasks" | "ready" | "impl" | "complete"
  approvals: {
    spec: ApprovalState
    plan: ApprovalState
    tasks: ApprovalState
  }
  ready_for_implementation: boolean
}

function makeSpecJson(featureName: string, featureNumber: number): SpecJson {
  const now = new Date().toISOString()
  return {
    feature_name: featureName,
    feature_number: featureNumber,
    created_at: now,
    updated_at: now,
    phase: "spec",
    approvals: {
      spec: { generated: false, approved: false },
      plan: { generated: false, approved: false },
      tasks: { generated: false, approved: false },
    },
    ready_for_implementation: false,
  }
}

function specJsonPath(featureDir: string): string {
  return path.join(featureDir, "spec.json")
}

async function readSpecJson(featureDir: string): Promise<SpecJson | null> {
  try {
    const data = await fs.readFile(specJsonPath(featureDir), "utf-8")
    return JSON.parse(data) as SpecJson
  } catch {
    return null
  }
}

async function writeSpecJson(sj: SpecJson, featureDir: string): Promise<void> {
  sj.updated_at = new Date().toISOString()
  await fs.writeFile(specJsonPath(featureDir), JSON.stringify(sj, null, 2), "utf-8")
}

interface SessionState {
  command: string | null
  phase: string
  featureDir: string | null
  featureNumber: number | null
  featureName: string | null
  nextStep: string | null
  lastResult: string | null
  history: string[]
}

const DEFAULT_SESSION: SessionState = {
  command: null,
  phase: "init",
  featureDir: null,
  featureNumber: null,
  featureName: null,
  nextStep: "/spec <description>",
  lastResult: null,
  history: [],
}

function sessionPath(root: string): string {
  return path.join(root, ".opencode", "spec-memory", "session.json")
}

async function readSession(root: string): Promise<SessionState> {
  try {
    const data = await fs.readFile(sessionPath(root), "utf-8")
    return { ...DEFAULT_SESSION, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_SESSION }
  }
}

async function writeSession(root: string, s: SessionState): Promise<void> {
  const dir = path.join(root, ".opencode", "spec-memory")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(sessionPath(root), JSON.stringify(s, null, 2), "utf-8")
}

function slugify(text: string, maxLen: number = 80): { slug: string; truncated: boolean } {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/^\d+-/, "")
  if (!raw) return { slug: "unnamed", truncated: false }
  const truncated = raw.length > maxLen
  return { slug: raw.slice(0, maxLen), truncated }
}

function makeFeatureDirName(featureName: string, number: number): { dir: string; truncated: boolean } {
  const { slug, truncated } = slugify(featureName)
  const dir = `${String(number).padStart(3, "0")}-${slug}`
  return { dir, truncated }
}

async function getNextFeatureNumber(projectRoot: string): Promise<number> {
  const specsDir = path.join(projectRoot, "specs")
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true })
    let max = 0
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const match = entry.name.match(/^(\d+)-/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > max) max = num
        }
      }
    }
    return max + 1
  } catch {
    return 1
  }
}

async function readTemplate(name: string): Promise<string | null> {
  const templatePath = path.join(TEMPLATES_DIR, `${name}-template.md`)
  try {
    return await fs.readFile(templatePath, "utf-8")
  } catch {
    return null
  }
}

export default tool({
  description: "Create a new feature scaffold: create specs/NNN-name/ or constitution with the appropriate template",
  args: {
    featureName: tool.schema.string().describe("Feature name or description to scaffold"),
    template: tool.schema.enum(["spec", "plan", "tasks", "constitution"]).describe("Which template to use"),
    techStack: tool.schema.string().optional().describe("Tech stack description (for plan template)"),
    overwrite: tool.schema.boolean().optional().describe("Overwrite existing files if they exist"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      const template = await readTemplate(args.template)

      if (args.template === "constitution") {
        const dir = path.join(projectRoot, ".opencode", "spec-memory")
        const filePath = path.join(dir, "constitution.md")
        if (!args.overwrite) {
          try {
            await fs.access(filePath)
            return {
              title: "Constitution exists",
              output: "constitution.md already exists in .opencode/spec-memory/  Use overwrite: true to overwrite",
              metadata: { exists: true, path: filePath },
            }
          } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
          }
        }
        await fs.mkdir(dir, { recursive: true })
        let content = template ?? "# Project Constitution\n\nDefault articles TBD."
        content = content.replace(/\[PROJECT NAME\]/g, args.featureName)
        await fs.writeFile(filePath, content, "utf-8")
        return {
          title: "Constitution created",
          output: "constitution.md created in .opencode/spec-memory/  Next: /spec <description>",
          metadata: { path: filePath },
        }
      }

      const featureNumber = await getNextFeatureNumber(projectRoot)
      const { dir: slug, truncated: slugTruncated } = makeFeatureDirName(args.featureName, featureNumber)
      const featureDirName = slug
      const featurePath = path.join(projectRoot, "specs", featureDirName)

      await fs.mkdir(featurePath, { recursive: true })

      const fileName = `${args.template}.md`
      const filePath = path.join(featurePath, fileName)

      if (!args.overwrite) {
        try {
          await fs.access(filePath)
          return {
            title: "File exists",
            output: `${fileName} already exists in specs/${featureDirName}/  Use overwrite: true to overwrite`,
            metadata: { exists: true, path: filePath },
          }
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
        }
      }

      let content = template ?? ""
      if (!template) {
        return {
          title: "Template missing",
          output: `Template not found for "${args.template}" in ${TEMPLATES_DIR}`,
          metadata: { error: "template not found", template: args.template },
        }
      }
      content = content
        .replace(/\[FEATURE NAME\]/g, args.featureName)
        .replace(/NNN-feature-name/g, featureDirName)
        .replace(/NNN/g, String(featureNumber).padStart(3, "0"))

      await fs.writeFile(filePath, content, "utf-8")

      const sjPath = specJsonPath(featurePath)
      let sj = await readSpecJson(featurePath)
      if (!sj) {
        sj = makeSpecJson(args.featureName, featureNumber)
      }
      if (args.template === "spec") {
        sj.phase = "spec"
        sj.approvals.spec.generated = true
      } else if (args.template === "plan") {
        sj.approvals.spec.approved = true
        sj.approvals.plan.generated = true
        sj.phase = "plan"
      } else if (args.template === "tasks") {
        sj.approvals.plan.approved = true
        sj.approvals.tasks.generated = true
        sj.phase = "tasks"
        if (sj.approvals.tasks.approved) {
          sj.phase = "ready"
          sj.ready_for_implementation = true
        }
      }
      await writeSpecJson(sj, featurePath)

      const nextHint = args.template === "spec"
        ? "/plan <tech stack>"
        : args.template === "plan"
          ? "/tasks"
          : "/impl"

      const phase = args.template === "spec" ? "spec" : args.template === "plan" ? "plan" : "tasks"

      const session = await readSession(projectRoot)
      session.command = "/" + args.template
      session.phase = phase
      session.featureDir = featureDirName
      session.featureNumber = featureNumber
      session.featureName = args.featureName
      session.nextStep = nextHint
      session.lastResult = `${fileName} created in specs/${featureDirName}/`
      session.history.push("/" + args.template)
      if (session.history.length > 20) session.history = session.history.slice(-20)
      await writeSession(projectRoot, session)

      let output = `${fileName} created in specs/${featureDirName}/`
      if (slugTruncated) {
        output += ` (truncated: "${args.featureName}" was too long)`
      }
      output += `  Next: ${nextHint}`

      return {
        title: `Scaffold: ${featureDirName}`,
        output,
        metadata: {
          featureDir: featureDirName,
          featureNumber,
          phase,
          nextCommand: nextHint,
          truncated: slugTruncated,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "Error",
        output: `scaffold: ${message}`,
        metadata: { error: message },
      }
    }
  },
})
