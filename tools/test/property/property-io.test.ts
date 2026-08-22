import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  writeSession,
  readSession,
  writeSpecJson,
  readSpecJson,
  writeConfigWithBackup,
  readConfig,
  computeBodyChecksum,
  writeWithBackup,
} from "../../shared/io"
import { SessionStateSchema, SpecJsonSchema, ConfigSchema } from "../../shared/schemas"
import type { SessionState, SpecJson, SDDConfig } from "../../shared/schemas"
import {
  arbitrarySessionState,
  arbitrarySpecJson,
  arbitrarySDDConfig,
} from "./arbitraries"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "property-test-"))
  await fs.mkdir(path.join(tmpDir, ".opencode", "spec-memory"), { recursive: true })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("Property: writeSession → readSession roundtrip", () => {
  it("for every valid SessionState, write then read returns same data", async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySessionState(), async (raw) => {
        const parsed = SessionStateSchema.safeParse(raw)
        if (!parsed.success) return
        const s = parsed.data

        await writeSession(tmpDir, s)
        const readBack = await readSession(tmpDir)

        expect(readBack.command).toBe(s.command)
        expect(readBack.phase).toBe(s.phase)
        expect(readBack.featureDir).toBe(s.featureDir)
        expect(readBack.featureNumber).toBe(s.featureNumber)
        expect(readBack.featureName).toBe(s.featureName)
        expect(readBack.nextStep).toBe(s.nextStep)
        expect(readBack.lastResult).toBe(s.lastResult)
        expect(readBack.history).toEqual(s.history)
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property: writeSpecJson → readSpecJson roundtrip", () => {
  it("for every valid SpecJson, write then read returns same data", async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySpecJson(), async (raw) => {
        const parsed = SpecJsonSchema.safeParse(raw)
        if (!parsed.success) return
        const sj = parsed.data

        const featureDir = path.join(tmpDir, "specs", "001-test")
        await fs.mkdir(featureDir, { recursive: true })

        await writeSpecJson(sj, featureDir)
        const readBack = await readSpecJson(featureDir)

        expect(readBack).not.toBeNull()
        expect(readBack!.feature_name).toBe(sj.feature_name)
        expect(readBack!.feature_number).toBe(sj.feature_number)
        expect(readBack!.phase).toBe(sj.phase)
        expect(readBack!.approvals).toEqual(sj.approvals)
        expect(readBack!.ready_for_implementation).toBe(sj.ready_for_implementation)
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property: writeConfig → readConfig roundtrip", () => {
  it("for every valid SDDConfig, write then read returns same data", async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySDDConfig(), async (raw) => {
        const parsed = ConfigSchema.safeParse(raw)
        if (!parsed.success) return
        const cfg = parsed.data

        await writeConfigWithBackup(tmpDir, cfg)
        const readBack = await readConfig(tmpDir)

        expect(readBack.defaultTechStack).toBe(cfg.defaultTechStack)
        expect(readBack.lastUsedLanguage).toBe(cfg.lastUsedLanguage)
        expect(readBack.expressMode).toBe(cfg.expressMode)
        expect(readBack.autoVersioning).toBe(cfg.autoVersioning)
        expect(readBack.preferences).toEqual(cfg.preferences)
      }),
      { numRuns: 100 }
    )
  })
})

describe("Property: computeBodyChecksum is deterministic", () => {
  const safeString = fc.string({ minLength: 1 }).filter((s) =>
    !s.includes("__proto__") &&
    !s.includes("toString") &&
    !s.includes("constructor") &&
    !s.includes("valueOf") &&
    !s.includes("hasOwnProperty") &&
    !s.includes("__defineGetter__") &&
    !s.includes("__defineSetter__")
  )

  it("for every string, computeBodyChecksum(c) === computeBodyChecksum(c)", () => {
    fc.assert(
      fc.property(safeString, (c) => {
        const first = computeBodyChecksum(c)
        const second = computeBodyChecksum(c)
        expect(first).toBe(second)
        expect(first).toMatch(/^[a-f0-9]{64}$/)
      }),
      { numRuns: 200 }
    )
  })

  it("CRLF normalization: content with \\r\\n matches content with \\n", () => {
    fc.assert(
      fc.property(safeString, (c) => {
        const withCRLF = c.replace(/\n/g, "\r\n")
        const withLF = c.replace(/\r\n/g, "\n")
        expect(computeBodyChecksum(withCRLF)).toBe(computeBodyChecksum(withLF))
      }),
      { numRuns: 200 }
    )
  })
})

describe("Property: writeWithBackup preserves previous content", () => {
  it("for every valid JSON string, backup contains exactly the previous content", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue().map((v) => JSON.stringify(v, null, 2)),
        fc.jsonValue().map((v) => JSON.stringify(v, null, 2)),
        async (firstContent, secondContent) => {
          const fp = path.join(tmpDir, "test.json")
          const backupDir = path.join(tmpDir, ".opencode", "backups")

          await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {})
          await fs.rm(fp, { force: true }).catch(() => {})

          await writeWithBackup(fp, firstContent, tmpDir)
          const afterFirst = await fs.readFile(fp, "utf-8")
          expect(afterFirst).toBe(firstContent)

          const filesAfterFirst = await fs.readdir(backupDir).catch(() => [])
          const bakFilesAfterFirst = filesAfterFirst.filter((f) => f.startsWith("test.json") && f.endsWith(".bak"))
          expect(bakFilesAfterFirst.length).toBe(0)

          await writeWithBackup(fp, secondContent, tmpDir)
          const afterSecond = await fs.readFile(fp, "utf-8")
          expect(afterSecond).toBe(secondContent)

          const files = await fs.readdir(backupDir).catch(() => [])
          const bakFiles = files.filter((f) => f.startsWith("test.json") && f.endsWith(".bak"))
          expect(bakFiles.length).toBe(1)

          const backupContent = await fs.readFile(path.join(backupDir, bakFiles[0]), "utf-8")
          expect(backupContent).toBe(firstContent)
        }
      ),
      { numRuns: 50 }
    )
  })
})
