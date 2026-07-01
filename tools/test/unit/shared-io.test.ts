import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  exists,
  readSession,
  writeSession,
  readSpecJson,
  writeSpecJson,
  getFeatureDirs,
  getLatestFeatureDir,
  makeSpecJson,
  DEFAULT_SESSION,
  sessionPath,
  specJsonPath,
  specsDirPath,
} from "../../shared/types"

let tmp: string

async function worktree(): Promise<string> {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "shared-io-"))
  return tmp
}

afterEach(async () => {
  if (tmp) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

// ── exists ─────────────────────────────────────────────────

describe("exists", () => {
  it("returns false for a missing file", async () => {
    const root = await worktree()
    expect(await exists(path.join(root, "nope"))).toBe(false)
  })

  it("returns true for an existing file", async () => {
    const root = await worktree()
    const fp = path.join(root, "present.txt")
    await fs.writeFile(fp, "hello", "utf-8")
    expect(await exists(fp)).toBe(true)
  })

  it("returns true for an existing directory", async () => {
    const root = await worktree()
    expect(await exists(root)).toBe(true)
  })
})

// ── readSession ────────────────────────────────────────────

describe("readSession", () => {
  it("returns DEFAULT_SESSION when the file does not exist", async () => {
    const root = await worktree()
    const result = await readSession(root)
    expect(result).toEqual(DEFAULT_SESSION)
  })

  it("merges stored values with DEFAULT_SESSION on valid JSON", async () => {
    const root = await worktree()
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, JSON.stringify({ phase: "spec", featureName: "test" }), "utf-8")
    const result = await readSession(root)
    expect(result.phase).toBe("spec")
    expect(result.featureName).toBe("test")
    expect(result.command).toBeNull()
    expect(result.history).toEqual([])
  })

  it("returns DEFAULT_SESSION on invalid JSON", async () => {
    const root = await worktree()
    const fp = sessionPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, "not json", "utf-8")
    const result = await readSession(root)
    expect(result).toEqual(DEFAULT_SESSION)
  })
})

// ── writeSession + readSession roundtrip ───────────────────

describe("writeSession + readSession", () => {
  it("writes and reads back session data", async () => {
    const root = await worktree()
    const s = {
      ...DEFAULT_SESSION,
      phase: "plan",
      featureName: "my feature",
    }
    await writeSession(root, s)
    const result = await readSession(root)
    expect(result.phase).toBe("plan")
    expect(result.featureName).toBe("my feature")
  })
})

// ── readSpecJson ───────────────────────────────────────────

describe("readSpecJson", () => {
  it("returns null when the file does not exist", async () => {
    const root = await worktree()
    expect(await readSpecJson(path.join(root, "specs", "001-foo"))).toBeNull()
  })

  it("returns parsed SpecJson for valid content", async () => {
    const root = await worktree()
    const sj = makeSpecJson("test", 1)
    await writeSpecJson(sj, root)
    const result = await readSpecJson(root)
    expect(result).not.toBeNull()
    expect(result!.feature_name).toBe("test")
    expect(result!.feature_number).toBe(1)
    expect(result!.phase).toBe("spec")
  })

  it("returns null for invalid JSON", async () => {
    const root = await worktree()
    const fp = specJsonPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, "not json", "utf-8")
    const result = await readSpecJson(root)
    expect(result).toBeNull()
  })

  it("returns null for valid JSON but invalid schema", async () => {
    const root = await worktree()
    const fp = specJsonPath(root)
    await fs.mkdir(path.dirname(fp), { recursive: true })
    await fs.writeFile(fp, JSON.stringify({ bad: true }), "utf-8")
    const result = await readSpecJson(root)
    expect(result).toBeNull()
  })
})

// ── writeSpecJson + readSpecJson roundtrip ─────────────────

describe("writeSpecJson + readSpecJson", () => {
  it("writes and reads back spec data, updates updated_at", async () => {
    const root = await worktree()
    const sj = makeSpecJson("roundtrip", 2)
    const originalUpdated = sj.updated_at
    await sleep(10)
    await writeSpecJson(sj, root)
    expect(sj.updated_at).not.toBe(originalUpdated)
    const result = await readSpecJson(root)
    expect(result).not.toBeNull()
    expect(result!.feature_name).toBe("roundtrip")
    expect(result!.feature_number).toBe(2)
  })
})

// ── getFeatureDirs ─────────────────────────────────────────

describe("getFeatureDirs", () => {
  it("returns empty array when specs dir is missing", async () => {
    const root = await worktree()
    const dirs = await getFeatureDirs(root)
    expect(dirs).toEqual([])
  })

  it("returns NNN-prefixed dirs sorted by number", async () => {
    const root = await worktree()
    const sd = specsDirPath(root)
    await fs.mkdir(path.join(sd, "003-z"), { recursive: true })
    await fs.mkdir(path.join(sd, "001-a"), { recursive: true })
    await fs.mkdir(path.join(sd, "002-b"), { recursive: true })
    const dirs = await getFeatureDirs(root)
    expect(dirs).toEqual(["001-a", "002-b", "003-z"])
  })

  it("ignores non-NNN directories", async () => {
    const root = await worktree()
    const sd = specsDirPath(root)
    await fs.mkdir(path.join(sd, "001-real"), { recursive: true })
    await fs.mkdir(path.join(sd, "ignored"), { recursive: true })
    await fs.mkdir(path.join(sd, "also-ignored"), { recursive: true })
    const dirs = await getFeatureDirs(root)
    expect(dirs).toEqual(["001-real"])
  })
})

// ── getLatestFeatureDir ────────────────────────────────────

describe("getLatestFeatureDir", () => {
  it("returns null when no feature dirs exist", async () => {
    const root = await worktree()
    expect(await getLatestFeatureDir(root)).toBeNull()
  })

  it("returns the highest-numbered feature dir", async () => {
    const root = await worktree()
    const sd = specsDirPath(root)
    await fs.mkdir(path.join(sd, "001-a"), { recursive: true })
    await fs.mkdir(path.join(sd, "002-b"), { recursive: true })
    await fs.mkdir(path.join(sd, "003-c"), { recursive: true })
    expect(await getLatestFeatureDir(root)).toBe("003-c")
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
