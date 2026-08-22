import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import fs from "node:fs/promises"
import crypto from "node:crypto"
import {
  readSpecJson,
  writeSpecJson,
  exists,
  getFeatureDirs,
  isValidProjectRoot,
  getProjectRootWarnings,
  detectParentProjectWithoutSession,
  readFrontmatter,
  writeFrontmatter,
  writeFrontmatterChecksum,
  computeBodyChecksum,
  syncFrontmatterFromSpecJson,
  specsDirPath,
  withLock,
  clearCorruptionWarnings,
  makeDeltaIndex,
  makeDelta,
  getNextDeltaId,
} from "./shared/types"
import type {
  Delta,
  DeltasIndex,
  DeltaFrontmatterData,
} from "./shared/schemas"
import { DeltasIndexSchema } from "./shared/schemas"

const DELTA_MAX_PER_FEATURE = 10
const DELTA_WARNING_THRESHOLD = 5

function deltasDir(featureDir: string): string {
  return path.join(featureDir, "deltas")
}

function deltasIndexPath(featureDir: string): string {
  return path.join(deltasDir(featureDir), "deltas.json")
}

function deltaSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

async function readDeltasIndex(featureDir: string): Promise<DeltasIndex> {
  const fp = deltasIndexPath(featureDir)
  try {
    const data = await fs.readFile(fp, "utf-8")
    const parsed = JSON.parse(data)
    const result = DeltasIndexSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch { /* ignore */ }
  const dirName = path.basename(featureDir)
  return makeDeltaIndex(dirName)
}

async function writeDeltasIndex(index: DeltasIndex, featureDir: string): Promise<void> {
  const dir = deltasDir(featureDir)
  await fs.mkdir(dir, { recursive: true })
  const fp = deltasIndexPath(featureDir)
  await fs.writeFile(fp, JSON.stringify(index, null, 2), "utf-8")
}

async function computeFileHash(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return crypto.createHash("sha256").update(content).digest("hex")
  } catch {
    return ""
  }
}

async function findTargetFeatureDir(projectRoot: string, featureName: string): Promise<string | null> {
  const dirs = await getFeatureDirs(projectRoot)
  for (const dir of dirs) {
    if (dir.includes(featureName.toLowerCase().replace(/\s+/g, "-"))) {
      return dir
    }
  }
  return dirs.length > 0 ? dirs[dirs.length - 1] : null
}

async function handleSpecDelta(projectRoot: string, featureDir: string, targetDir: string, description: string) {
  const index = await readDeltasIndex(featureDir)
  const activeDeltas = index.deltas.filter(d => d.status !== "cancelled")
  if (activeDeltas.length >= DELTA_MAX_PER_FEATURE) {
    return { title: "Error", output: `Delta limit reached (${DELTA_MAX_PER_FEATURE}). Consolidate or cancel existing deltas.` }
  }
  if (activeDeltas.length >= DELTA_WARNING_THRESHOLD) {
    console.warn(`[SDD] Warning: ${activeDeltas.length} active deltas (limit: ${DELTA_MAX_PER_FEATURE})`)
  }

  const specFp = path.join(featureDir, "spec.md")
  const specHash = await computeFileHash(specFp)
  const deltaId = getNextDeltaId(index.deltas)
  const slug = deltaSlug(description)

  const delta: Delta = makeDelta(deltaId, "feature", description, "medium", targetDir)
  const deltaSpecPath = path.join(deltasDir(featureDir), `${deltaId}-${slug}.md`)

  await fs.mkdir(deltasDir(featureDir), { recursive: true })

  const content = `---\ndelta_id: ${deltaId}\ntype: feature\nstatus: draft\nimpact: medium\nparent_feature: ${targetDir}\nparent_spec_hash: "${specHash}"\n---\n\n# Delta ${deltaId}: ${description}\n\n## Contexto\nReferencia: spec.md\n\n## Cambio Propuesto\n${description}\n\n## Impacto\n- Archivos afectados: (pendiente)\n- Breaking changes: (pendiente)\n- Tests nuevos: (pendiente)\n\n## Criterios de Aceptación\n- GIVEN (pendiente)\n- WHEN (pendiente)\n- THEN (pendiente)\n\n## Dependencias\n- Requiere: spec base aprobada\n`

  await fs.writeFile(deltaSpecPath, content, "utf-8")
  index.deltas.push(delta)
  await writeDeltasIndex(index, featureDir)

  const sj = await readSpecJson(featureDir)
  if (sj) {
    sj.active_delta = deltaId
    await writeSpecJson(sj, featureDir)
  }

  return {
    title: `Delta ${deltaId} created`,
    output: `Delta ${deltaId} created in ${path.basename(deltaSpecPath)}  Next: /plan-delta ${deltaId}`,
    metadata: { deltaId, path: deltaSpecPath },
  }
}

async function handlePlanDelta(projectRoot: string, featureDir: string, targetDir: string, deltaId: string) {
  if (!deltaId) return { title: "Error", output: "Delta ID required (e.g., D001)" }

  const index = await readDeltasIndex(featureDir)
  const delta = index.deltas.find(d => d.id === deltaId)
  if (!delta) return { title: "Error", output: `Delta ${deltaId} not found` }
  if (delta.status !== "draft") return { title: "Error", output: `Delta ${deltaId} status is ${delta.status}, expected draft` }

  const specFp = path.join(featureDir, "spec.md")
  const specHash = await computeFileHash(specFp)

  const planPath = path.join(deltasDir(featureDir), `${deltaId}-plan.md`)

  const content = `---\ndelta_id: ${deltaId}\ntype: ${delta.type}\nstatus: planned\nimpact: ${delta.impact}\nparent_feature: ${targetDir}\n---\n\n# Plan Delta ${deltaId}: ${delta.title}\n\n## Cambios en plan.md principal\nNo se modifica plan.md principal. Este es un plan incremental.\n\n## Archivos a modificar\n- (pendiente)\n\n## Secuencia de implementación\n1. (pendiente)\n\n## Testing\n- (pendiente)\n`

  await fs.writeFile(planPath, content, "utf-8")

  delta.status = "planned"
  delta.updated_at = new Date().toISOString()
  await writeDeltasIndex(index, featureDir)

  return {
    title: `Plan Delta ${deltaId} created`,
    output: `Plan created at ${path.basename(planPath)}  Next: /tasks-delta ${deltaId}`,
    metadata: { deltaId, path: planPath },
  }
}

async function handleTasksDelta(projectRoot: string, featureDir: string, targetDir: string, deltaId: string) {
  if (!deltaId) return { title: "Error", output: "Delta ID required (e.g., D001)" }

  const index = await readDeltasIndex(featureDir)
  const delta = index.deltas.find(d => d.id === deltaId)
  if (!delta) return { title: "Error", output: `Delta ${deltaId} not found` }
  if (delta.status !== "planned") return { title: "Error", output: `Delta ${deltaId} status is ${delta.status}, expected planned` }

  const planPath = path.join(deltasDir(featureDir), `${deltaId}-plan.md`)
  const planExists = await exists(planPath)
  if (!planExists) return { title: "Error", output: `Plan for ${deltaId} not found. Run /plan-delta ${deltaId} first.` }

  const tasksPath = path.join(deltasDir(featureDir), `${deltaId}-tasks.md`)

  const content = `---\ndelta_id: ${deltaId}\ntype: ${delta.type}\nstatus: ready\nimpact: ${delta.impact}\nparent_feature: ${targetDir}\n---\n\n# Tasks Delta ${deltaId}: ${delta.title}\n\n## Fase 1: Implementación\n- [ ] Task 1: (pendiente) Boundary: ${delta.title}\n- [ ] Task 2: (pendiente) Boundary: ${delta.title}\n\n## Fase 2: Testing\n- [ ] Task 3: (pendiente) Boundary: ${delta.title}\n`

  await fs.writeFile(tasksPath, content, "utf-8")

  delta.status = "ready"
  delta.updated_at = new Date().toISOString()
  await writeDeltasIndex(index, featureDir)

  return {
    title: `Tasks Delta ${deltaId} created`,
    output: `Tasks created at ${path.basename(tasksPath)}  Next: /impl-delta ${deltaId}`,
    metadata: { deltaId, path: tasksPath },
  }
}

async function handleImplDelta(projectRoot: string, featureDir: string, targetDir: string, deltaId: string) {
  if (!deltaId) return { title: "Error", output: "Delta ID required (e.g., D001)" }

  const index = await readDeltasIndex(featureDir)
  const delta = index.deltas.find(d => d.id === deltaId)
  if (!delta) return { title: "Error", output: `Delta ${deltaId} not found` }

  if (delta.status === "ready") {
    delta.status = "implementing"
    delta.updated_at = new Date().toISOString()
    await writeDeltasIndex(index, featureDir)

    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.active_delta = deltaId
      await writeSpecJson(sj, featureDir)
    }

    return {
      title: `Delta ${deltaId} implementing`,
      output: `Delta ${deltaId} is now implementing. Complete implementation, then run /impl-delta ${deltaId} again to consolidate.`,
      metadata: { deltaId },
    }
  }

  if (delta.status === "implementing") {
    const deltaDir = deltasDir(featureDir)
    const deltaPlanPath = path.join(deltaDir, `${deltaId}-plan.md`)
    const deltaTasksPath = path.join(deltaDir, `${deltaId}-tasks.md`)
    const deltaSpecPath = path.join(deltaDir, `${deltaId}-${deltaSlug(delta.title)}.md`)

    const specFp = path.join(featureDir, "spec.md")
    const planFp = path.join(featureDir, "plan.md")
    const tasksFp = path.join(featureDir, "tasks.md")

    const deltaPlanContent = await fs.readFile(deltaPlanPath, "utf-8").catch(() => "")
    const deltaTasksContent = await fs.readFile(deltaTasksPath, "utf-8").catch(() => "")
    const deltaSpecContent = await fs.readFile(deltaSpecPath, "utf-8").catch(() => "")

    if (deltaPlanContent) {
      const existingPlan = await fs.readFile(planFp, "utf-8").catch(() => "")
      const deltaBody = extractBody(deltaPlanContent)
      if (deltaBody) {
        const merged = existingPlan.trimEnd() + "\n\n---\n\n## Delta " + deltaId + ": " + delta.title + "\n\n" + deltaBody
        await fs.writeFile(planFp, merged, "utf-8")
      }
    }

    if (deltaTasksContent) {
      const existingTasks = await fs.readFile(tasksFp, "utf-8").catch(() => "")
      const deltaBody = extractBody(deltaTasksContent)
      if (deltaBody) {
        const merged = existingTasks.trimEnd() + "\n\n---\n\n## Delta " + deltaId + ": " + delta.title + "\n\n" + deltaBody
        await fs.writeFile(tasksFp, merged, "utf-8")
      }
    }

    if (deltaSpecContent) {
      const existingSpec = await fs.readFile(specFp, "utf-8").catch(() => "")
      const deltaBody = extractBody(deltaSpecContent)
      if (deltaBody) {
        const merged = existingSpec.trimEnd() + "\n\n---\n\n## Delta " + deltaId + ": " + delta.title + "\n\n" + deltaBody
        await fs.writeFile(specFp, merged, "utf-8")
      }
    }

    const sj = await readSpecJson(featureDir)
    if (sj) {
      sj.active_delta = null
      await writeSpecJson(sj, featureDir)
      await syncFrontmatterFromSpecJson(featureDir, sj)
    }

    await writeFrontmatterChecksum(specFp)
    await writeFrontmatterChecksum(planFp)
    await writeFrontmatterChecksum(tasksFp)

    delta.status = "consolidated"
    delta.consolidated_at = new Date().toISOString()
    delta.updated_at = new Date().toISOString()
    await writeDeltasIndex(index, featureDir)

    return {
      title: `Delta ${deltaId} consolidated`,
      output: `Delta ${deltaId} merged into spec.md, plan.md, tasks.md. Frontmatter checksums updated. ${deltaId} marked consolidated.`,
      metadata: { deltaId },
    }
  }

  return { title: "Error", output: `Delta ${deltaId} status is ${delta.status}, expected ready or implementing` }
}

function extractBody(mdContent: string): string {
  const lines = mdContent.split("\n")
  const bodyLines: string[] = []
  let pastFrontmatter = false
  let pastTitle = false
  for (const line of lines) {
    if (!pastFrontmatter) {
      if (line.trim() === "---") {
        pastFrontmatter = true
      }
      continue
    }
    if (!pastTitle) {
      if (line.startsWith("# ")) {
        pastTitle = true
        continue
      }
      continue
    }
    bodyLines.push(line)
  }
  return bodyLines.join("\n").trim()
}

async function handleDeltaStatus(projectRoot: string, featureDir: string, targetDir: string) {
  const index = await readDeltasIndex(featureDir)
  if (index.deltas.length === 0) {
    return {
      title: "No deltas",
      output: `No deltas found for ${targetDir}. Create one with /spec-delta <description>`,
      metadata: { deltas: [] },
    }
  }

  const lines = index.deltas.map(d => {
    const statusIcon = d.status === "consolidated" ? "+" : d.status === "cancelled" ? "x" : d.status === "ready" ? "*" : "-"
    return `  [${statusIcon}] ${d.id}: ${d.title} (${d.status}, ${d.type}, ${d.impact})`
  })

  const active = index.deltas.filter(d => d.status !== "consolidated" && d.status !== "cancelled").length
  const consolidated = index.deltas.filter(d => d.status === "consolidated").length

  return {
    title: `Delta Status: ${targetDir}`,
    output: `Deltas: ${index.deltas.length} total, ${active} active, ${consolidated} consolidated\n${lines.join("\n")}`,
    metadata: { deltas: index.deltas },
  }
}

export default tool({
  description: "Create incremental delta specs for existing features, generate delta plans/tasks, and implement deltas",
  args: {
    command: tool.schema.enum(["spec-delta", "plan-delta", "tasks-delta", "impl-delta", "delta-status"]).describe("Delta command to run"),
    description: tool.schema.string().optional().describe("Delta description (for spec-delta)"),
    deltaId: tool.schema.string().optional().describe("Delta ID (e.g., D001)"),
    featureDir: tool.schema.string().optional().describe("Feature directory"),
  },
  async execute(args, context) {
    clearCorruptionWarnings()
    try {
      const projectRoot = context.worktree
      if (!projectRoot) return { title: "Error", output: "No worktree path provided" }
      if (!await isValidProjectRoot(projectRoot)) return { title: "Error", output: "Not a valid project directory" }
      const projectWarnings = await getProjectRootWarnings(projectRoot)
      if (projectWarnings.length > 0) {
        return {
          title: "Warning",
          output: projectWarnings.map(w => w.message).join("\n\n"),
          metadata: { warnings: projectWarnings, requiresConfirmation: true },
        }
      }
      const parentProject = await detectParentProjectWithoutSession(projectRoot)
      if (parentProject) {
        return {
          title: "Warning",
          output: `Parent project detected at ${parentProject} without session. Do you want to continue?`,
          metadata: { parentProject, requiresConfirmation: true },
        }
      }

      const targetDir = args.featureDir || await findTargetFeatureDir(projectRoot, args.description || "")
      if (!targetDir) {
        return { title: "Error", output: "No feature directories found. Create a spec first with /spec" }
      }

      const featureDir = path.join(specsDirPath(projectRoot), targetDir)
      const specFp = path.join(featureDir, "spec.md")
      const specExists = await exists(specFp)
      if (!specExists) {
        return { title: "Error", output: `Feature ${targetDir} has no spec.md` }
      }

      switch (args.command) {
        case "spec-delta":
          return await handleSpecDelta(projectRoot, featureDir, targetDir, args.description || "")
        case "plan-delta":
          return await handlePlanDelta(projectRoot, featureDir, targetDir, args.deltaId || "")
        case "tasks-delta":
          return await handleTasksDelta(projectRoot, featureDir, targetDir, args.deltaId || "")
        case "impl-delta":
          return await handleImplDelta(projectRoot, featureDir, targetDir, args.deltaId || "")
        case "delta-status":
          return await handleDeltaStatus(projectRoot, featureDir, targetDir)
        default:
          return { title: "Error", output: "Unknown delta command" }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { title: "Error", output: `Delta error: ${msg}` }
    }
  },
})
