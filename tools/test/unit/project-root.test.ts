import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { resolveProjectRoot, pickProjectRoot, isFilesystemRoot } from "../../shared/types"

let worktree: string

beforeEach(async () => {
  worktree = await fs.mkdtemp(path.join(os.tmpdir(), "root-resolve-"))
  await fs.mkdir(path.join(worktree, ".opencode", "spec-memory"), { recursive: true })
})

afterEach(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
})

describe("isFilesystemRoot", () => {
  it("detects drive roots, posix roots, and empty strings", () => {
    expect(isFilesystemRoot("C:\\")).toBe(true)
    expect(isFilesystemRoot("C:")).toBe(true)
    expect(isFilesystemRoot("c:/")).toBe(true)
    expect(isFilesystemRoot("/")).toBe(true)
    expect(isFilesystemRoot("\\")).toBe(true)
    expect(isFilesystemRoot("")).toBe(true)
    expect(isFilesystemRoot("   ")).toBe(true)
  })

  it("rejects normal project paths", () => {
    expect(isFilesystemRoot("C:\\Users\\me\\project")).toBe(false)
    expect(isFilesystemRoot("/home/me/project")).toBe(false)
  })
})

describe("resolveProjectRoot", () => {
  it("uses a valid worktree", async () => {
    const result = await resolveProjectRoot({ worktree, directory: undefined })
    expect(result.root).toBe(worktree)
    expect(result.error).toBeNull()
  })

  it("falls back to directory when worktree is a filesystem root", async () => {
    const result = await resolveProjectRoot({ worktree: "/", directory: worktree })
    expect(result.root).toBe(worktree)
    expect(result.error).toBeNull()
  })

  it("falls back to directory when worktree is invalid", async () => {
    const result = await resolveProjectRoot({ worktree: path.join(worktree, "nope"), directory: worktree })
    expect(result.root).toBe(worktree)
  })

  it("errors when both candidates are filesystem roots", async () => {
    const result = await resolveProjectRoot({ worktree: "C:\\", directory: "/" })
    expect(result.root).toBeNull()
    expect(result.error).toContain("Not a valid project directory")
  })

  it("errors when no candidates are provided", async () => {
    const result = await resolveProjectRoot({ worktree: null, directory: undefined })
    expect(result.root).toBeNull()
    expect(result.error).toBe("No worktree path provided")
  })
})

describe("pickProjectRoot", () => {
  it("returns the first non-root candidate", () => {
    expect(pickProjectRoot({ worktree: "/", directory: "C:\\Users\\me\\project" })).toBe("C:\\Users\\me\\project")
    expect(pickProjectRoot({ worktree: worktree, directory: "/" })).toBe(worktree)
  })

  it("returns null when every candidate is a root or missing", () => {
    expect(pickProjectRoot({ worktree: "/", directory: "/" })).toBeNull()
    expect(pickProjectRoot({ worktree: undefined, directory: null })).toBeNull()
  })
})
