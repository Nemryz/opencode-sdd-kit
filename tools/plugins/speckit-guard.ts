import type { Plugin } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import path from "node:path"

export type GuardConfig = {
  version: number
  enabled: boolean
  debug: boolean
  protectedFiles: string[]
  protectedAfterApproval: string[]
  protectedByPhase: Record<string, string[]>
  stats: {
    denied: number
    allowed: number
    asked: number
  }
  denials: Array<{
    timestamp: string
    file: string
    reason: string
  }>
}

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
    ".opencode/steering/product.md",
    ".opencode/steering/tech.md",
    ".opencode/steering/structure.md",
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

export function isProtectedFile(filePath: string, config: GuardConfig): string | null {
  for (const pattern of config.protectedFiles) {
    if (filePath.endsWith(pattern) || path.basename(filePath) === path.basename(pattern)) {
      return `Always protected: ${pattern}`
    }
  }
  return null
}

export function isProtectedAfterApproval(filePath: string, config: GuardConfig): string | null {
  const basename = path.basename(filePath)
  if (config.protectedAfterApproval.includes(basename)) {
    return `Protected after approval: ${basename}`
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
  if (basename === "spec.json" || basename === "spec.md") return spec.approvals?.spec?.approved ?? false
  if (basename === "plan.md") return spec.approvals?.plan?.approved ?? false
  if (basename === "tasks.md") return spec.approvals?.tasks?.approved ?? false
  return false
}

export function isProtectedByPhase(filePath: string, phase: string, config: GuardConfig): string | null {
  const basename = path.basename(filePath)
  const protectedInPhase = config.protectedByPhase[phase]
  if (protectedInPhase && protectedInPhase.includes(basename)) {
    return `Protected in ${phase} phase: ${basename}`
  }
  return null
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

  async function readConfig(): Promise<GuardConfig> {
    try {
      const content = await fs.readFile(configPath, "utf-8")
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  async function writeConfig(config: GuardConfig): Promise<void> {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  }

  return {
    "permission.ask": async (permission, output) => {
      if (permission.type !== "edit") return

      const config = await readConfig()
      if (!config.enabled) return

      const filePath = permission.pattern
        ? Array.isArray(permission.pattern) ? permission.pattern[0] : permission.pattern
        : ""

      if (!filePath) return

      config.stats.asked++

      const alwaysProtected = isProtectedFile(filePath, config)
      if (alwaysProtected) {
        output.status = "deny"
        config.stats.denied++
        addDenial(config, filePath, alwaysProtected)
        if (config.debug) {
          console.log(`[Guard] DENIED: ${filePath} - ${alwaysProtected}`)
        }
        await writeConfig(config)
        return
      }

      const protectedAfterApproval = isProtectedAfterApproval(filePath, config)
      if (protectedAfterApproval) {
        const spec = await getSpecJson(filePath, input.worktree)
        if (spec && isApprovedForFile(path.basename(filePath), spec)) {
          output.status = "deny"
          config.stats.denied++
          addDenial(config, filePath, `${protectedAfterApproval} (approved)`)
          if (config.debug) {
            console.log(`[Guard] DENIED: ${filePath} - ${protectedAfterApproval} (approved)`)
          }
          await writeConfig(config)
          return
        }
      }

      const spec = await getSpecJson(filePath, input.worktree)
      if (spec) {
        const protectedByPhase = isProtectedByPhase(filePath, spec.phase, config)
        if (protectedByPhase) {
          output.status = "deny"
          config.stats.denied++
          addDenial(config, filePath, protectedByPhase)
          if (config.debug) {
            console.log(`[Guard] DENIED: ${filePath} - ${protectedByPhase}`)
          }
          await writeConfig(config)
          return
        }
      }

      config.stats.allowed++
      if (config.debug) {
        console.log(`[Guard] ALLOWED: ${filePath}`)
      }
      await writeConfig(config)
    },
  }
}

export default {
  id: "speckit-guard",
  server: guardPlugin,
}
