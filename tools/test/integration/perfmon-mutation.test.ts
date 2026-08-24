import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import perfTool from "../../speckit-perf"
import { getRecommendations, calculatePercentileExport } from "../../plugins/speckit-perfmon"
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

describe("speckit-perfmon mutation score improvement", () => {
  describe("calculatePercentileExport mutations", () => {
    it("returns 0 for empty array", () => {
      expect(calculatePercentileExport([], 0.5)).toBe(0)
    })

    it("returns first element for p0", () => {
      expect(calculatePercentileExport([10, 20, 30], 0)).toBe(10)
    })

    it("returns last element for p1", () => {
      expect(calculatePercentileExport([10, 20, 30], 1)).toBe(30)
    })

    it("returns correct value for single element", () => {
      expect(calculatePercentileExport([42], 0.5)).toBe(42)
    })

    it("handles large arrays", () => {
      const sorted = Array.from({ length: 1000 }, (_, i) => i)
      expect(calculatePercentileExport(sorted, 0.99)).toBe(990)
    })
  })

  describe("getRecommendations mutations", () => {
    it("returns empty for no stats", () => {
      expect(getRecommendations({ lastUpdated: "", stats: [] })).toHaveLength(0)
    })

    it("returns caching recommendation for p99 > 2000", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 5, totalTime: 10000, times: [], avg: 2000, p50: 1500, p95: 2500, p99: 3000 }],
      })
      expect(recs.some(r => r.includes("Consider caching"))).toBe(true)
    })

    it("does not return caching recommendation for p99 <= 2000", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 5, totalTime: 5000, times: [], avg: 1000, p50: 800, p95: 1200, p99: 1500 }],
      })
      expect(recs.some(r => r.includes("Consider caching"))).toBe(false)
    })

    it("returns variance recommendation when p99/p50 > 5", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 5, totalTime: 3000, times: [], avg: 600, p50: 100, p95: 500, p99: 600 }],
      })
      expect(recs.some(r => r.includes("High variance"))).toBe(true)
    })

    it("does not return variance recommendation when p99/p50 <= 5", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 5, totalTime: 5000, times: [], avg: 1000, p50: 800, p95: 1200, p99: 1500 }],
      })
      expect(recs.some(r => r.includes("High variance"))).toBe(false)
    })

    it("returns frequently slow recommendation when calls > 100 and avg > 500", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 150, totalTime: 90000, times: [], avg: 600, p50: 500, p95: 700, p99: 800 }],
      })
      expect(recs.some(r => r.includes("Frequently slow"))).toBe(true)
    })

    it("does not return frequently slow when calls <= 100", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 100, totalTime: 60000, times: [], avg: 600, p50: 500, p95: 700, p99: 800 }],
      })
      expect(recs.some(r => r.includes("Frequently slow"))).toBe(false)
    })

    it("does not return frequently slow when avg <= 500", () => {
      const recs = getRecommendations({
        lastUpdated: "",
        stats: [{ tool: "t", calls: 150, totalTime: 60000, times: [], avg: 400, p50: 350, p95: 450, p99: 500 }],
      })
      expect(recs.some(r => r.includes("Frequently slow"))).toBe(false)
    })
  })

  describe("perfTool mutations", () => {
    it("formats duration in seconds for values >= 1000ms", async () => {
      const perfDir = path.join(worktree, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: "2026-08-23T05:00:00.000Z",
        stats: [{ tool: "slow", calls: 1, totalTime: 2500, times: [], avg: 2500, p50: 2500, p95: 2500, p99: 2500 }],
      }))
      const result = await perfTool.execute({}, ctx)
      expect(result.output).toContain("2.5s")
    })

    it("formats duration in ms for values < 1000ms", async () => {
      const perfDir = path.join(worktree, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: "2026-08-23T05:00:00.000Z",
        stats: [{ tool: "fast", calls: 1, totalTime: 500, times: [], avg: 500, p50: 500, p95: 500, p99: 500 }],
      }))
      const result = await perfTool.execute({}, ctx)
      expect(result.output).toContain("500ms")
    })

    it("validates top N parameter", async () => {
      const perfDir = path.join(worktree, ".opencode")
      await fs.mkdir(perfDir, { recursive: true })
      await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify({
        lastUpdated: "2026-08-23T05:00:00.000Z",
        stats: [
          { tool: "a", calls: 1, totalTime: 1000, times: [], avg: 1000, p50: 1000, p95: 1000, p99: 1000 },
          { tool: "b", calls: 1, totalTime: 500, times: [], avg: 500, p50: 500, p95: 500, p99: 500 },
          { tool: "c", calls: 1, totalTime: 200, times: [], avg: 200, p50: 200, p95: 200, p99: 200 },
        ],
      }))
      const result = await perfTool.execute({ subcommand: "top abc" }, ctx)
      expect(result.output).toContain("a")
      expect(result.output).toContain("b")
      expect(result.output).toContain("c")
    })
  })
})
