import type { Plugin } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { withLock, atomicWriteFile, markPluginLoaded } from "../shared/io"

export const GuardConfigSchema = z.object({
  version: z.number(),
  enabled: z.boolean(),
  debug: z.boolean(),
  protectedFiles: z.array(z.string()),
  protectedAfterApproval: z.array(z.string()),
  protectedByPhase: z.record(z.string(), z.array(z.string())),
  stats: z.object({
    denied: z.number(),
    allowed: z.number(),
    asked: z.number(),
  }),
  denials: z.array(z.object({
    timestamp: z.string(),
    file: z.string(),
    reason: z.string(),
  })),
})

export type GuardConfig = z.infer<typeof GuardConfigSchema>

type SpecJson = {
  phase: string
  approvals: {
    spec: { generated: boolean; approved: boolean }
    plan: { generated: boolean; approved: boolean }
    tasks: { generated: boolean; approved: boolean }
  }
}

export const DEFAULT_CONFIG: GuardConfig = {
  version: 1,
  enabled: true,
  debug: false,
  protectedFiles: [
    ".opencode/spec-memory/constitution.md",
    ".opencode/spec-memory/session.json",
    ".opencode/spec-memory/config.json",
    ".opencode/guard.json",
    "spec.json",
  ],
  protectedAfterApproval: ["spec.json", "spec.md", "plan.md", "tasks.md"],
  protectedByPhase: {
    tasks: ["plan.md"],
    ready: ["plan.md", "tasks.md"],
    impl: ["plan.md", "tasks.md"],
    complete: ["plan.md", "tasks.md", "spec.md", "spec.json"],
  },
  stats: { denied: 0, allowed: 0, asked: 0 },
  denials: [],
}

const MAX_DENIALS_LOG = 10

const CONSTITUTION_PLACEHOLDERS = [
  "[PROJECT NAME]",
  "[add project-specific constraints]",
  "[describe testing tools / patterns]",
  "[document configuration approach]",
  "[document integration test setup]",
  "[list lint/format/type-check tools]",
  "[document any doc conventions]",
]

export function isDraftConstitution(content: string): boolean {
  for (const placeholder of CONSTITUTION_PLACEHOLDERS) {
    if (content.includes(placeholder)) return true
  }
  return false
}

export function cloneConfig(config: GuardConfig): GuardConfig {
  return {
    ...config,
    protectedFiles: [...config.protectedFiles],
    protectedAfterApproval: [...config.protectedAfterApproval],
    protectedByPhase: Object.fromEntries(
      Object.entries(config.protectedByPhase).map(([phase, files]) => [phase, [...files]]),
    ),
    stats: { ...config.stats },
    denials: config.denials.map(d => ({ ...d })),
  }
}

const FILE_TOOLS = ["write", "edit", "apply_patch", "patch"]

export function normalizeGuardPath(p: string): string {
  const unified = p.replace(/\\/g, "/")
  return process.platform === "win32" || process.platform === "darwin" ? unified.toLowerCase() : unified
}

export function guardBasename(p: string): string {
  const unified = p.replace(/\\/g, "/")
  const idx = unified.lastIndexOf("/")
  return idx >= 0 ? unified.slice(idx + 1) : unified
}

export function isProtectedFile(filePath: string, config: GuardConfig): string | null {
  const normalized = normalizeGuardPath(filePath)
  const base = guardBasename(normalized)
  for (const pattern of config.protectedFiles) {
    const normalizedPattern = normalizeGuardPath(pattern)
    if (normalized.endsWith(normalizedPattern) || base === guardBasename(normalizedPattern)) {
      return `Always protected: ${pattern}`
    }
  }
  return null
}

export function isProtectedAfterApproval(filePath: string, config: GuardConfig): string | null {
  const base = guardBasename(normalizeGuardPath(filePath))
  if (config.protectedAfterApproval.some(f => normalizeGuardPath(f) === base)) {
    return `Protected after approval: ${base}`
  }
  return null
}

export async function getSpecJson(filePath: string, worktree: string): Promise<SpecJson | null> {
  const featureDir = path.dirname(filePath)
  const specJsonPath = path.join(featureDir, "spec.json")
  try {
    const content = await fs.readFile(specJsonPath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function isApprovedForFile(basename: string, spec: SpecJson): boolean {
  const base = normalizeGuardPath(basename)
  if (base === "spec.json" || base === "spec.md") return spec.approvals?.spec?.approved ?? false
  if (base === "plan.md") return spec.approvals?.plan?.approved ?? false
  if (base === "tasks.md") return spec.approvals?.tasks?.approved ?? false
  return false
}

export function isProtectedByPhase(filePath: string, phase: string, config: GuardConfig): string | null {
  const base = guardBasename(normalizeGuardPath(filePath))
  const protectedInPhase = config.protectedByPhase[phase]
  if (protectedInPhase && protectedInPhase.some(f => normalizeGuardPath(f) === base)) {
    return `Protected in ${phase} phase: ${base}`
  }
  return null
}

export function isListedInAnyPhase(filePath: string, config: GuardConfig): boolean {
  const base = guardBasename(normalizeGuardPath(filePath))
  return Object.values(config.protectedByPhase).some(list => list.some(f => normalizeGuardPath(f) === base))
}

export function extractRedirectTargets(command: string): string[] {
  const targets: string[] = []
  const stripQuotes = (s: string) => s.replace(/^["']|["']$/g, "")
  const redirectRe = />>?\s*("[^"]+"|'[^']+'|[^\s"'`;|&<>()]+)/g
  const teeRe = /\btee\b(?:\s+-a)?\s+("[^"]+"|'[^']+'|[^\s"'`;|&<>()]+)/g
  let match: RegExpExecArray | null
  while ((match = redirectRe.exec(command)) !== null) {
    targets.push(stripQuotes(match[1]))
  }
  while ((match = teeRe.exec(command)) !== null) {
    targets.push(stripQuotes(match[1]))
  }
  return targets
}

export function addDenial(config: GuardConfig, file: string, reason: string): void {
  config.denials.unshift({
    timestamp: new Date().toISOString(),
    file,
    reason,
  })
  if (config.denials.length > MAX_DENIALS_LOG) {
    config.denials = config.denials.slice(0, MAX_DENIALS_LOG)
  }
}

const guardPlugin: Plugin = async (input) => {
  const configPath = path.join(input.worktree, ".opencode", "guard.json")
  await markPluginLoaded(input.worktree, "speckit-guard")

  async function readConfig(): Promise<GuardConfig> {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(await fs.readFile(configPath, "utf-8"))
    } catch {
      return cloneConfig(DEFAULT_CONFIG)
    }
    const result = GuardConfigSchema.safeParse({ ...DEFAULT_CONFIG, ...(parsed as object) })
    return result.success ? result.data : cloneConfig(DEFAULT_CONFIG)
  }

  async function writeConfig(config: GuardConfig): Promise<void> {
    const result = GuardConfigSchema.safeParse(config)
    if (!result.success) return
    await withLock(configPath, async () => {
      await atomicWriteFile(configPath, JSON.stringify(result.data, null, 2))
    })
  }

  async function normalizePath(filePath: string): Promise<string> {
    let resolved = path.isAbsolute(filePath) ? filePath : path.resolve(input.worktree, filePath)
    try {
      resolved = await fs.realpath(resolved)
    } catch {
      // file may not exist yet, fall back to the resolved path
    }
    return resolved
  }

  async function evaluatePath(rawPath: string, config: GuardConfig): Promise<string | null> {
    const normalized = await normalizePath(rawPath)

    const alwaysProtected = isProtectedFile(normalized, config)
    if (alwaysProtected) {
      if (normalizeGuardPath(guardBasename(normalized)) === "constitution.md") {
        try {
          const content = await fs.readFile(normalized, "utf-8")
          if (isDraftConstitution(content)) return null
        } catch {
          // unreadable constitution stays protected (fail closed)
        }
      }
      return alwaysProtected
    }

    const spec = await getSpecJson(normalized, input.worktree)

    const afterApproval = isProtectedAfterApproval(normalized, config)
    if (afterApproval) {
      if (!spec) return `${afterApproval} (spec.json unreadable, denied as a precaution)`
      if (isApprovedForFile(guardBasename(normalized), spec)) return `${afterApproval} (approved)`
    }

    if (!spec) {
      if (isListedInAnyPhase(normalized, config)) {
        return "Phase-protected file with unreadable spec.json, denied as a precaution"
      }
      return null
    }

    return isProtectedByPhase(normalized, spec.phase, config)
  }

  async function deny(config: GuardConfig, output: { status: "ask" | "deny" | "allow" }, displayPath: string, reason: string): Promise<void> {
    output.status = "deny"
    config.stats.denied++
    addDenial(config, displayPath, reason)
    if (config.debug) {
      console.log(`[Guard] DENIED: ${displayPath} - ${reason}`)
    }
    await writeConfig(config)
  }

  async function block(config: GuardConfig, displayPath: string, reason: string): Promise<never> {
    config.stats.denied++
    addDenial(config, displayPath, reason)
    if (config.debug) {
      console.log(`[Guard] BLOCKED: ${displayPath} - ${reason}`)
    }
    await writeConfig(config)
    throw new Error(`Guard blocked protected file: ${displayPath} (${reason})`)
  }

  return {
    "tool.execute.before": async (toolInput, toolOutput) => {
      const config = await readConfig()
      if (!config.enabled) return

      const args = (toolOutput?.args ?? {}) as Record<string, unknown>
      const tool = toolInput?.tool

      if (FILE_TOOLS.includes(tool)) {
        const rawPath = args.filePath ?? args.path
        if (typeof rawPath !== "string" || rawPath.length === 0) return
        const reason = await evaluatePath(rawPath, config)
        if (reason) await block(config, rawPath, reason)
        return
      }

      if (tool === "bash") {
        const command = typeof args.command === "string" ? args.command : ""
        for (const target of extractRedirectTargets(command)) {
          const reason = await evaluatePath(target, config)
          if (reason) await block(config, target, `shell redirect target: ${reason}`)
        }
      }
    },

    "permission.ask": async (permission, output) => {
      const config = await readConfig()
      if (!config.enabled) return

      const patterns = permission.pattern
        ? Array.isArray(permission.pattern) ? permission.pattern : [permission.pattern]
        : []
      if (patterns.length === 0) return

      if (permission.type === "edit") {
        config.stats.asked++
        const reason = await evaluatePath(patterns[0], config)
        if (reason) {
          await deny(config, output, patterns[0], reason)
          return
        }
      } else if (permission.type === "bash") {
        config.stats.asked++
        for (const command of patterns) {
          for (const target of extractRedirectTargets(command)) {
            const reason = await evaluatePath(target, config)
            if (reason) {
              await deny(config, output, target, `shell redirect target: ${reason}`)
              return
            }
          }
        }
      } else {
        return
      }

      config.stats.allowed++
      if (config.debug) {
        console.log(`[Guard] ALLOWED: ${permission.type}`)
      }
      await writeConfig(config)
    },
  }
}

export default {
  id: "speckit-guard",
  server: guardPlugin,
}
