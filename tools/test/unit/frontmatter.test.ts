import { describe, it, expect, beforeEach, afterEach } from "vitest"
import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import { mkdtemp } from "node:fs/promises"
import {
  readFrontmatter,
  writeFrontmatter,
  computeBodyChecksum,
  verifyBodyIntegrity,
  reconstructFromFrontmatter,
  syncFrontmatterFromSpecJson,
} from "../../shared/io"
import { makeSpecJson } from "../../shared/types"
import type { FrontmatterData } from "../../shared/schemas"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "frontmatter-test-"))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("readFrontmatter", () => {
  it("returns null for file without frontmatter", async () => {
    const fp = path.join(tmpDir, "no-fm.md")
    await fs.writeFile(fp, "# Hello\n\nContent here\n", "utf-8")
    const result = await readFrontmatter(fp)
    expect(result).toBeNull()
  })

  it("reads frontmatter from markdown file", async () => {
    const fp = path.join(tmpDir, "with-fm.md")
    await fs.writeFile(fp, "---\nfeature_name: test\nfeature_number: 1\nphase: spec\n---\n# Hello\n", "utf-8")
    const result = await readFrontmatter(fp)
    expect(result).toEqual({
      feature_name: "test",
      feature_number: 1,
      phase: "spec",
    })
  })

  it("returns null for non-existent file", async () => {
    const fp = path.join(tmpDir, "missing.md")
    const result = await readFrontmatter(fp)
    expect(result).toBeNull()
  })

  it("returns null for invalid frontmatter", async () => {
    const fp = path.join(tmpDir, "bad-fm.md")
    await fs.writeFile(fp, "---\nphase: invalid-phase\n---\n# Hello\n", "utf-8")
    const result = await readFrontmatter(fp)
    expect(result).toBeNull()
  })

  it("reads all optional fields", async () => {
    const fp = path.join(tmpDir, "full-fm.md")
    const data: FrontmatterData = {
      feature_name: "test",
      feature_number: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      phase: "ready",
      status: "approved",
      checksum: "abc123",
      boundaries: ["boundary-1"],
    }
    await fs.writeFile(fp, "---\n" + Object.entries(data).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") + "\n---\n# Hello\n", "utf-8")
    const result = await readFrontmatter(fp)
    expect(result).toEqual(data)
  })
})

describe("writeFrontmatter", () => {
  it("writes frontmatter to markdown file", async () => {
    const fp = path.join(tmpDir, "write-fm.md")
    await fs.writeFile(fp, "# Hello\n\nContent here\n", "utf-8")
    const data: FrontmatterData = {
      feature_name: "test",
      phase: "spec",
    }
    await writeFrontmatter(fp, data)
    const content = await fs.readFile(fp, "utf-8")
    expect(content).toContain("feature_name: test")
    expect(content).toContain("phase: spec")
    expect(content).toContain("# Hello")
    expect(content).toContain("Content here")
  })

  it("preserves existing frontmatter fields", async () => {
    const fp = path.join(tmpDir, "preserve-fm.md")
    await fs.writeFile(fp, "---\nfeature_name: old\nfeature_number: 1\n---\n# Hello\n", "utf-8")
    const data: FrontmatterData = {
      feature_name: "new",
      phase: "plan",
    }
    await writeFrontmatter(fp, data)
    const result = await readFrontmatter(fp)
    expect(result?.feature_name).toBe("new")
    expect(result?.feature_number).toBe(1)
    expect(result?.phase).toBe("plan")
  })
})

describe("computeBodyChecksum", () => {
  it("computes checksum of body content", async () => {
    const content = "---\nfeature_name: test\n---\n# Hello\n"
    const checksum = computeBodyChecksum(content)
    expect(checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it("produces same checksum for same body", async () => {
    const content1 = "---\nfeature_name: test\n---\n# Hello\n"
    const content2 = "---\nfeature_name: other\n---\n# Hello\n"
    const c1 = computeBodyChecksum(content1)
    const c2 = computeBodyChecksum(content2)
    expect(c1).toBe(c2)
  })

  it("produces different checksums for different bodies", async () => {
    const content1 = "---\nfeature_name: test\n---\n# Hello\n"
    const content2 = "---\nfeature_name: test\n---\n# Different\n"
    const c1 = computeBodyChecksum(content1)
    const c2 = computeBodyChecksum(content2)
    expect(c1).not.toBe(c2)
  })
})

describe("verifyBodyIntegrity", () => {
  it("returns true when no checksum in frontmatter", async () => {
    const fp = path.join(tmpDir, "no-checksum.md")
    await fs.writeFile(fp, "---\nfeature_name: test\n---\n# Hello\n", "utf-8")
    const result = await verifyBodyIntegrity(fp)
    expect(result).toBe(true)
  })

  it("returns true when checksum matches", async () => {
    const fp = path.join(tmpDir, "match-checksum.md")
    const body = "# Hello\n"
    const content = `---\nfeature_name: test\nchecksum: ${computeBodyChecksum("---\nfeature_name: test\n---\n" + body)}\n---\n${body}`
    await fs.writeFile(fp, content, "utf-8")
    const result = await verifyBodyIntegrity(fp)
    expect(result).toBe(true)
  })

  it("returns false when checksum mismatches", async () => {
    const fp = path.join(tmpDir, "mismatch-checksum.md")
    await fs.writeFile(fp, '---\nfeature_name: test\nchecksum: "0000000000000000000000000000000000000000000000000000000000000000"\n---\n# Hello\n', "utf-8")
    const result = await verifyBodyIntegrity(fp)
    expect(result).toBe(false)
  })

  it("returns true for non-existent file", async () => {
    const fp = path.join(tmpDir, "missing.md")
    const result = await verifyBodyIntegrity(fp)
    expect(result).toBe(true)
  })
})

describe("reconstructFromFrontmatter", () => {
  it("returns null when spec.md does not exist", async () => {
    const result = await reconstructFromFrontmatter(tmpDir)
    expect(result).toBeNull()
  })

  it("reconstructs from spec.md frontmatter", async () => {
    await fs.writeFile(path.join(tmpDir, "spec.md"), "---\nfeature_name: test\nfeature_number: 1\nphase: spec\n---\n# Spec\n", "utf-8")
    const result = await reconstructFromFrontmatter(tmpDir)
    expect(result).not.toBeNull()
    expect(result?.feature_name).toBe("test")
    expect(result?.feature_number).toBe(1)
    expect(result?.phase).toBe("spec")
  })

  it("reconstructs with plan.md frontmatter", async () => {
    await fs.writeFile(path.join(tmpDir, "spec.md"), "---\nfeature_name: test\nfeature_number: 1\n---\n# Spec\n", "utf-8")
    await fs.writeFile(path.join(tmpDir, "plan.md"), "---\nphase: plan\n---\n# Plan\n", "utf-8")
    const result = await reconstructFromFrontmatter(tmpDir)
    expect(result?.phase).toBe("plan")
  })

  it("reconstructs with tasks.md frontmatter", async () => {
    await fs.writeFile(path.join(tmpDir, "spec.md"), "---\nfeature_name: test\nfeature_number: 1\n---\n# Spec\n", "utf-8")
    await fs.writeFile(path.join(tmpDir, "plan.md"), "---\nphase: plan\n---\n# Plan\n", "utf-8")
    await fs.writeFile(path.join(tmpDir, "tasks.md"), "---\nphase: tasks\n---\n# Tasks\n", "utf-8")
    const result = await reconstructFromFrontmatter(tmpDir)
    expect(result?.phase).toBe("tasks")
  })

  it("reconstructs approvals from status", async () => {
    await fs.writeFile(path.join(tmpDir, "spec.md"), "---\nfeature_name: test\nfeature_number: 1\nphase: spec\nstatus: approved\n---\n# Spec\n", "utf-8")
    await fs.writeFile(path.join(tmpDir, "plan.md"), "---\nphase: plan\nstatus: validated\n---\n# Plan\n", "utf-8")
    await fs.writeFile(path.join(tmpDir, "tasks.md"), "---\nphase: tasks\nstatus: generated\n---\n# Tasks\n", "utf-8")
    const result = await reconstructFromFrontmatter(tmpDir)
    expect(result?.approvals.spec.generated).toBe(true)
    expect(result?.approvals.spec.approved).toBe(true)
    expect(result?.approvals.plan.generated).toBe(true)
    expect(result?.approvals.plan.approved).toBe(false)
    expect(result?.approvals.tasks.generated).toBe(true)
    expect(result?.approvals.tasks.approved).toBe(false)
  })
})

describe("syncFrontmatterFromSpecJson", () => {
  it("writes frontmatter to spec.md", async () => {
    await fs.writeFile(path.join(tmpDir, "spec.md"), "# Hello\n", "utf-8")
    const sj = makeSpecJson("test", 1)
    sj.phase = "spec"
    sj.approvals.spec.generated = true
    await syncFrontmatterFromSpecJson(tmpDir, sj)
    const result = await readFrontmatter(path.join(tmpDir, "spec.md"))
    expect(result?.feature_name).toBe("test")
    expect(result?.feature_number).toBe(1)
    expect(result?.phase).toBe("spec")
    expect(result?.status).toBe("validated")
  })

  it("skips non-existent files", async () => {
    const sj = makeSpecJson("test", 1)
    await syncFrontmatterFromSpecJson(tmpDir, sj)
    const specExists = await fs.access(path.join(tmpDir, "spec.md")).then(() => true).catch(() => false)
    expect(specExists).toBe(false)
  })
})
