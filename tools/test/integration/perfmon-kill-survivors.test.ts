import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import perfmon, { getRecommendations } from "../../plugins/speckit-perfmon"
import { mockContext, createTempWorktree, destroyTempWorktree } from "../helpers/setup"

let worktree: string
let ctx: ReturnType<typeof mockContext>

beforeEach(async () => {
  worktree = await createTempWorktree()
  ctx = mockContext(worktree)
})

afterEach(async () => {
  await destroyTempWorktree(worktree)
})

describe("speckit-perfmon kill survivors", () => {
  describe("boundary conditions for getRecommendations", () => {
    it("does NOT recommend caching when p99 is exactly 2000", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 5, totalTime: 10000, times: [], avg: 2000, p50: 1500, p95: 1900, p99: 2000 }],
      })
      expect(recs.some(r => r.includes("Consider caching"))).toBe(false)
    })

    it("does NOT recommend variance when p50 is 0", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 5, totalTime: 1000, times: [], avg: 200, p50: 0, p95: 500, p99: 1000 }],
      })
      expect(recs.some(r => r.includes("High variance"))).toBe(false)
    })

    it("does NOT recommend variance when p99/p50 is exactly 5", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 5, totalTime: 5000, times: [], avg: 500, p50: 100, p95: 300, p99: 500 }],
      })
      expect(recs.some(r => r.includes("High variance"))).toBe(false)
    })

    it("does NOT recommend frequently slow when calls is exactly 100", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 100, totalTime: 60000, times: [], avg: 600, p50: 500, p95: 700, p99: 800 }],
      })
      expect(recs.some(r => r.includes("Frequently slow"))).toBe(false)
    })

    it("does NOT recommend frequently slow when avg is exactly 500", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 150, totalTime: 75000, times: [], avg: 500, p50: 450, p95: 550, p99: 600 }],
      })
      expect(recs.some(r => r.includes("Frequently slow"))).toBe(false)
    })
  })

  describe("plugin hooks (before + after)", () => {
    it("records call in before hook", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      const toolInput = { callID: "call-1", tool: "test-tool", args: {} }
      const toolOutput = { args: {} }

      await hooks["tool.execute.before"](toolInput as any, toolOutput as any)

      const afterResult = await hooks["tool.execute.after"](toolInput as any)
      expect(afterResult).toBeUndefined()
    })

    it("skips after hook when callID not found", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      const toolInput = { callID: "nonexistent", tool: "test-tool", args: {} }
      const result = await hooks["tool.execute.after"](toolInput as any)
      expect(result).toBeUndefined()

      const perfPath = path.join(worktree, ".opencode", "perf.json")
      const exists = await fs.access(perfPath).then(() => true).catch(() => false)
      expect(exists).toBe(false)
    })

    it("tracks multiple calls sequentially", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c1", tool: "tool-a", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "tool-a", args: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c2", tool: "tool-a", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c2", tool: "tool-a", args: {} } as any)

      const perfPath = path.join(worktree, ".opencode", "perf.json")
      const content = await fs.readFile(perfPath, "utf-8")
      const perf = JSON.parse(content)
      expect(perf.stats[0].calls).toBe(2)
    })

    it("creates perf.json with correct stats after single call", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "call-1", tool: "my-tool", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "call-1", tool: "my-tool", args: {} } as any)

      const perfPath = path.join(worktree, ".opencode", "perf.json")
      const content = await fs.readFile(perfPath, "utf-8")
      const perf = JSON.parse(content)
      expect(perf.stats).toHaveLength(1)
      expect(perf.stats[0].tool).toBe("my-tool")
      expect(perf.stats[0].calls).toBe(1)
      expect(perf.stats[0].times).toHaveLength(1)
      expect(perf.stats[0].p50).toBe(perf.stats[0].times[0])
      expect(perf.stats[0].p95).toBe(perf.stats[0].times[0])
      expect(perf.stats[0].p99).toBe(perf.stats[0].times[0])
      expect(perf.stats[0].avg).toBe(perf.stats[0].times[0])
    })

    it("accumulates multiple calls to same tool", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      for (let i = 0; i < 3; i++) {
        await hooks["tool.execute.before"]({ callID: `c${i}`, tool: "same-tool", args: {} } as any, { args: {} } as any)
        await hooks["tool.execute.after"]({ callID: `c${i}`, tool: "same-tool", args: {} } as any)
      }

      const perfPath = path.join(worktree, ".opencode", "perf.json")
      const content = await fs.readFile(perfPath, "utf-8")
      const perf = JSON.parse(content)
      expect(perf.stats).toHaveLength(1)
      expect(perf.stats[0].calls).toBe(3)
      expect(perf.stats[0].times).toHaveLength(3)
    })

    it("separates stats by tool name", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c1", tool: "alpha", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "alpha", args: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c2", tool: "beta", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c2", tool: "beta", args: {} } as any)

      const perfPath = path.join(worktree, ".opencode", "perf.json")
      const content = await fs.readFile(perfPath, "utf-8")
      const perf = JSON.parse(content)
      expect(perf.stats).toHaveLength(2)
      expect(perf.stats.find((s: any) => s.tool === "alpha")?.calls).toBe(1)
      expect(perf.stats.find((s: any) => s.tool === "beta")?.calls).toBe(1)
    })

    it("updates lastUpdated timestamp", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)
      const before = Date.now()

      await hooks["tool.execute.before"]({ callID: "c1", tool: "t", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "t", args: {} } as any)

      const perfPath = path.join(worktree, ".opencode", "perf.json")
      const content = await fs.readFile(perfPath, "utf-8")
      const perf = JSON.parse(content)
      const ts = new Date(perf.lastUpdated).getTime()
      expect(ts).toBeGreaterThanOrEqual(before)
    })

    it("creates .opencode directory if missing", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c1", tool: "t", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "t", args: {} } as any)

      const dirExists = await fs.access(path.join(worktree, ".opencode")).then(() => true).catch(() => false)
      expect(dirExists).toBe(true)
    })

    it("reads existing perf.json and merges stats", async () => {
      const perfDir = path.join(worktree, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: "2026-01-01T00:00:00.000Z",
        stats: [{ tool: "existing", calls: 5, totalTime: 1000, times: [200], p50: 200, p95: 200, p99: 200, avg: 200 }],
      }))

      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c1", tool: "new-tool", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "new-tool", args: {} } as any)

      const content = await fs.readFile(path.join(perfDir, "perf.json"), "utf-8")
      const perf = JSON.parse(content)
      expect(perf.stats).toHaveLength(2)
      expect(perf.stats.find((s: any) => s.tool === "existing")?.calls).toBe(5)
      expect(perf.stats.find((s: any) => s.tool === "new-tool")?.calls).toBe(1)
    })

    it("handles corrupt perf.json gracefully", async () => {
      const perfDir = path.join(worktree, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), "not-json{{{")

      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c1", tool: "t", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "t", args: {} } as any)

      const content = await fs.readFile(path.join(perfDir, "perf.json"), "utf-8")
      const perf = JSON.parse(content)
      expect(perf.stats).toHaveLength(1)
      expect(perf.stats[0].tool).toBe("t")
    })
  })

  describe("export default metadata", () => {
    it("has correct plugin id", () => {
      expect(perfmon.id).toBe("speckit-perfmon")
    })

    it("has server function", () => {
      expect(typeof perfmon.server).toBe("function")
    })
  })

  describe("path validation via plugin hooks", () => {
    it("writes perf.json at correct path", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c1", tool: "t", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "t", args: {} } as any)

      const expectedPath = path.join(worktree, ".opencode", "perf.json")
      const content = await fs.readFile(expectedPath, "utf-8")
      expect(content).toContain("t")
    })

    it("does NOT create perf.json at wrong path", async () => {
      const server = perfmon.server!
      const hooks = await server({ worktree, config: {} } as any)

      await hooks["tool.execute.before"]({ callID: "c1", tool: "t", args: {} } as any, { args: {} } as any)
      await hooks["tool.execute.after"]({ callID: "c1", tool: "t", args: {} } as any)

      const wrongPaths = [
        path.join(worktree, "perf.json"),
        path.join(worktree, ".opencode", "perf"),
        path.join(worktree, "wrong-dir", "perf.json"),
      ]
      for (const wp of wrongPaths) {
        const exists = await fs.access(wp).then(() => true).catch(() => false)
        expect(exists).toBe(false)
      }
    })
  })
})
