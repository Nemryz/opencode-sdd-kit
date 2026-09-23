import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { createTempWorktree, destroyTempWorktree } from "../helpers/setup"
import {
  readConfig,
  readSession,
  readSpecJson,
  configPath,
  sessionPath,
  specJsonPath,
  specsDirPath,
  corruptionWarnings,
  clearCorruptionWarnings,
} from "../../shared/types"

const BOM = "\uFEFF"

let worktree: string

beforeEach(async () => {
  clearCorruptionWarnings()
  worktree = await createTempWorktree()
})

afterEach(async () => {
  clearCorruptionWarnings()
  await destroyTempWorktree(worktree)
})

describe("BOM tolerance for JSON state files", () => {
  it("reads a config.json with a UTF-8 BOM without corruption warnings", async () => {
    await fs.writeFile(
      configPath(worktree),
      BOM +
        JSON.stringify({
          defaultTechStack: "BOM-Stack",
          lastUsedLanguage: "es",
          expressMode: true,
          autoVersioning: false,
          preferences: {},
        }),
      "utf-8",
    )
    const cfg = await readConfig(worktree)
    expect(cfg.defaultTechStack).toBe("BOM-Stack")
    expect(cfg.expressMode).toBe(true)
    expect(corruptionWarnings.length).toBe(0)
  })

  it("reads a session.json with a UTF-8 BOM", async () => {
    await fs.writeFile(
      sessionPath(worktree),
      BOM +
        JSON.stringify({
          command: "/spec",
          phase: "spec",
          featureDir: "001-bom",
          featureNumber: 1,
          featureName: "bom",
          nextStep: "/plan",
          lastResult: null,
          history: ["/spec"],
        }),
      "utf-8",
    )
    const session = await readSession(worktree)
    expect(session.phase).toBe("spec")
    expect(session.featureDir).toBe("001-bom")
    expect(corruptionWarnings.length).toBe(0)
  })

  it("reads a spec.json with a UTF-8 BOM", async () => {
    const featureDir = path.join(specsDirPath(worktree), "001-bom")
    await fs.mkdir(featureDir, { recursive: true })
    await fs.writeFile(
      specJsonPath(featureDir),
      BOM +
        JSON.stringify({
          feature_name: "bom",
          feature_number: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          phase: "spec",
          approvals: {
            spec: { generated: true, approved: false },
            plan: { generated: false, approved: false },
            tasks: { generated: false, approved: false },
          },
          ready_for_implementation: false,
        }),
      "utf-8",
    )
    const sj = await readSpecJson(featureDir)
    expect(sj?.feature_name).toBe("bom")
    expect(sj?.phase).toBe("spec")
    expect(corruptionWarnings.length).toBe(0)
  })
})
