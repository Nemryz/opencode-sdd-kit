import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import {
  readSession,
  writeSession,
  readSpecJson,
  writeSpecJson,
  makeSpecJson,
  parseNNN,
  specsDirPath,
  steeringDirPath,
  specJsonPath,
  sessionPath,
  exists,
  isENOENT,
  isValidProjectRoot,
  withLock,
  PATHS,
} from "./shared/types"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates")

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
  const specsDir = specsDirPath(projectRoot)
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

async function findTargetFeatureDir(projectRoot: string, featureName: string): Promise<string | null> {
  const specsDir = specsDirPath(projectRoot)
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => parseNNN(a) - parseNNN(b))
    if (dirs.length === 0) return null
    const { slug } = slugify(featureName)
    const exact = dirs.find(d => {
      const dirSlug = d.replace(/^\d+-/, "")
      return dirSlug === slug
    })
    return exact ?? dirs[dirs.length - 1]
  } catch {
    return null
  }
}

async function findExactFeatureBySlug(projectRoot: string, featureName: string): Promise<string | null> {
  const specsDir = specsDirPath(projectRoot)
  const { slug } = slugify(featureName)
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirSlug = entry.name.replace(/^\d+-/, "")
        if (dirSlug === slug) {
          return entry.name
        }
      }
    }
  } catch { /* ignore */ }
  return null
}

async function safeToWrite(filePath: string, overwrite?: boolean): Promise<boolean> {
  if (overwrite) return true
  try {
    await fs.access(filePath)
    return false
  } catch (err) {
    if (!isENOENT(err)) throw err
    return true
  }
}

export default tool({
  description: "Create a new feature scaffold: create specs/NNN-name/ or constitution with the appropriate template",
  args: {
    featureName: tool.schema.string().describe("Feature name or description to scaffold"),
    template: tool.schema.enum(["spec", "plan", "tasks", "constitution", "steering", "data-model", "domain-map", "glossary", "research", "contracts"]).describe("Which template to use"),
    techStack: tool.schema.string().optional().describe("Tech stack description (for plan template)"),
    overwrite: tool.schema.boolean().optional().describe("Overwrite existing files if they exist"),
  },
  async execute(args, context) {
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }
      const template = await readTemplate(args.template)

      if (args.template === "steering") {
        const dir = steeringDirPath(projectRoot)
        await fs.mkdir(dir, { recursive: true })
        const files = ["product-steering", "tech-steering", "structure-steering"] as const
        const labels: Record<string, string> = {
          "product-steering": "Product",
          "tech-steering": "Tech",
          "structure-steering": "Structure",
        }
        const allExist = await Promise.all(
          files.map(f => exists(path.join(dir, `${labels[f].toLowerCase()}.md`))),
        )
        const created: string[] = []
        const skipped: string[] = []
        for (let i = 0; i < files.length; i++) {
          const fileName = `${labels[files[i]].toLowerCase()}.md`
          const filePath = path.join(dir, fileName)
          if (allExist[i] && !args.overwrite) {
            skipped.push(fileName)
            continue
          }
          const tmpl = await readTemplate(files[i])
          let content = tmpl ?? `# ${labels[files[i]]} Steering\n\nSteering document for ${labels[files[i]]} context.\n`
          content = content.replace(/\[PROJECT NAME\]/g, args.featureName)
          await fs.writeFile(filePath, content, "utf-8")
          created.push(fileName)
        }
        const parts: string[] = []
        if (created.length > 0) parts.push(`created: ${created.join(", ")}`)
        if (skipped.length > 0) parts.push(`skipped (exist): ${skipped.join(", ")}`)
        return {
          title: `Steering: ${created.length} created, ${skipped.length} skipped`,
          output: parts.join(" | ") + "  Next: /spec <description>",
          metadata: { created, skipped, path: dir },
        }
      }

      if (args.template === "constitution") {
        const dir = path.join(projectRoot, PATHS.OPENCODE_DIR, PATHS.SPEC_MEMORY_DIR)
        const filePath = path.join(dir, PATHS.CONSTITUTION_FILE)
        const canWrite = await safeToWrite(filePath, args.overwrite)
        if (!canWrite) {
          return {
            title: "Constitution exists",
            output: "constitution.md already exists in .opencode/spec-memory/  Use overwrite: true to overwrite",
            metadata: { exists: true, path: filePath },
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

      // --- Project-level optional artifacts: domain-map, glossary ---

      if (args.template === "domain-map" || args.template === "glossary") {
        const dir = path.join(projectRoot, PATHS.OPENCODE_DIR)
        const filePath = path.join(dir, `${args.template}.md`)
        const canWrite = await safeToWrite(filePath, args.overwrite)
        if (!canWrite) {
          return {
            title: `${args.template}.md exists`,
            output: `${args.template}.md already exists in .opencode/  Use overwrite: true to overwrite`,
            metadata: { exists: true, path: filePath },
          }
        }
        await fs.mkdir(dir, { recursive: true })
        let content = template ?? `# ${args.template === "domain-map" ? "Domain Map" : "Domain Glossary"}\n\nOptional ${args.template} for the project.\n`
        content = content.replace(/\[PROJECT NAME\]/g, args.featureName)
        await fs.writeFile(filePath, content, "utf-8")
        return {
          title: `${args.template}.md created`,
          output: `${args.template}.md created in .opencode/  Next: /spec <description>`,
          metadata: { path: filePath },
        }
      }

      // --- Per-feature optional artifact: data-model ---

      if (args.template === "data-model") {
        const targetDir = await findTargetFeatureDir(projectRoot, args.featureName)
        if (!targetDir) {
          return {
            title: "Error",
            output: "No feature directories found in specs/. Create a spec first with /spec <description>",
            metadata: { error: "no features exist" },
          }
        }
        const featurePath = path.join(specsDirPath(projectRoot), targetDir)
        const filePath = path.join(featurePath, "data-model.md")
        const canWrite = await safeToWrite(filePath, args.overwrite)
        if (!canWrite) {
          return {
            title: "data-model.md exists",
            output: `data-model.md already exists in specs/${targetDir}/  Use overwrite: true to overwrite`,
            metadata: { exists: true, path: filePath },
          }
        }
        let content = template ?? "# Data Model\n\nData model for the feature.\n"
        content = content.replace(/\[FEATURE NAME\]/g, args.featureName).replace(/NNN-feature-name/g, targetDir!)
        await fs.writeFile(filePath, content, "utf-8")
        return {
          title: "data-model.md created",
          output: `data-model.md created in specs/${targetDir}/  Next: continue with your workflow`,
          metadata: { path: filePath, featureDir: targetDir },
        }
      }

      // --- Per-feature optional artifacts: research, contracts ---

      if (args.template === "research" || args.template === "contracts") {
        const targetDir = await findTargetFeatureDir(projectRoot, args.featureName)
        if (!targetDir) {
          return {
            title: "Error",
            output: "No feature directories found in specs/. Create a spec first with /spec <description>",
            metadata: { error: "no features exist" },
          }
        }

        if (args.template === "research") {
          const featurePath = path.join(specsDirPath(projectRoot), targetDir!)
          const filePath = path.join(featurePath, "research.md")
          const canWrite = await safeToWrite(filePath, args.overwrite)
          if (!canWrite) {
            return {
              title: "research.md exists",
              output: `research.md already exists in specs/${targetDir}/  Use overwrite: true to overwrite`,
              metadata: { exists: true, path: filePath },
            }
          }
          let content = template ?? "# Research\n\nTechnology research notes.\n"
          content = content.replace(/\[FEATURE NAME\]/g, args.featureName).replace(/NNN-feature-name/g, targetDir!)
          await fs.writeFile(filePath, content, "utf-8")
          return {
            title: "research.md created",
            output: `research.md created in specs/${targetDir}/  Next: continue with your workflow`,
            metadata: { path: filePath, featureDir: targetDir },
          }
        }

        if (args.template === "contracts") {
          const featurePath = path.join(specsDirPath(projectRoot), targetDir!)
          const dirPath = path.join(featurePath, "contracts")
          await fs.mkdir(dirPath, { recursive: true })
          if (template) {
            const indexPath = path.join(dirPath, "_template.md")
            if (args.overwrite || !(await exists(indexPath))) {
              let content = template.replace(/\[FEATURE NAME\]/g, args.featureName).replace(/NNN-feature-name/g, targetDir!)
              await fs.writeFile(indexPath, content, "utf-8")
            }
          }
          return {
            title: "contracts/ created",
            output: `contracts/ directory created in specs/${targetDir}/  Next: continue with your workflow`,
            metadata: { path: dirPath, featureDir: targetDir },
          }
        }
      }

      let featureDirName = ""
      let featureNumber = 0
      let featurePath = ""
      let slugTruncated = false

      const specsPath = specsDirPath(projectRoot)
      if (args.template === "plan" || args.template === "tasks") {
        const existing = await findExactFeatureBySlug(projectRoot, args.featureName)
        if (existing) {
          featureDirName = existing
          featurePath = path.join(specsPath, existing)
          featureNumber = parseInt(existing.match(/^(\d+)/)?.[1] ?? "0", 10)
        } else {
          await withLock(specsPath, async () => {
            featureNumber = await getNextFeatureNumber(projectRoot)
            const r = makeFeatureDirName(args.featureName, featureNumber)
            featureDirName = r.dir
            featurePath = path.join(specsPath, featureDirName)
            slugTruncated = r.truncated
            await fs.mkdir(featurePath, { recursive: true })
          })
        }
      } else {
        await withLock(specsPath, async () => {
          featureNumber = await getNextFeatureNumber(projectRoot)
          const r = makeFeatureDirName(args.featureName, featureNumber)
          featureDirName = r.dir
          featurePath = path.join(specsPath, featureDirName)
          slugTruncated = r.truncated
          await fs.mkdir(featurePath, { recursive: true })
        })
      }

      const fileName = `${args.template}.md`
      const filePath = path.join(featurePath, fileName)

      const canWrite = await safeToWrite(filePath, args.overwrite)
      if (!canWrite) {
        return {
          title: "File exists",
          output: `${fileName} already exists in specs/${featureDirName}/  Use overwrite: true to overwrite`,
          metadata: { exists: true, path: filePath },
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
        .replace(/\[TECH STACK\]/g, args.techStack ?? "")
        .replace(/NNN-feature-name/g, featureDirName)
        .replace(/NNN/g, String(featureNumber).padStart(3, "0"))

      await fs.writeFile(filePath, content, "utf-8")

      await withLock(specJsonPath(featurePath), async () => {
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
      })

      const nextHint = args.template === "spec"
        ? "/plan <tech stack>"
        : args.template === "plan"
          ? "/tasks"
          : "/impl"

      const phase = args.template === "spec" ? "spec" : args.template === "plan" ? "plan" : "tasks"

      await withLock(sessionPath(projectRoot), async () => {
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
      })

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
