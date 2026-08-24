import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import perfTool from "../../speckit-perf"
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

describe("speckit-perf integration tests", () => {
  it("returns no data message when perf.json doesn't exist", async () => {
    const result = await perfTool.execute({}, ctx)
    expect(result.title).toBe("Performance Data")
    expect(result.output).toContain("No performance data collected yet")
  })

  it("reads and displays perf data from perf.json", async () => {
    const perfDir = path.join(worktree, ".opencode")
    await fs.mkdir(perfDir, { recursive: true })
    const perfData = {
      lastUpdated: "2026-08-23T05:00:00.000Z",
      stats: [
        {
          tool: "speckit-audit",
          calls: 67,
          totalTime: 59630,
          times: [],
          avg: 890,
          p50: 850,
          p95: 2100,
          p99: 4500,
        },
        {
          tool: "speckit-scaffold",
          calls: 142,
          totalTime: 17040,
          times: [],
          avg: 120,
          p50: 100,
          p95: 340,
          p99: 890,
        },
      ],
    }
    await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify(perfData))

    const result = await perfTool.execute({}, ctx)
    expect(result.title).toBe("Tool Performance Report")
    expect(result.output).toContain("speckit-audit")
    expect(result.output).toContain("speckit-scaffold")
    expect(result.output).toContain("Slowest: speckit-audit")
  })

  it("displays top N slowest tools", async () => {
    const perfDir = path.join(worktree, ".opencode")
    await fs.mkdir(perfDir, { recursive: true })
    const perfData = {
      lastUpdated: "2026-08-23T05:00:00.000Z",
      stats: [
        { tool: "tool-a", calls: 10, totalTime: 10000, times: [], avg: 1000, p50: 900, p95: 1200, p99: 1500 },
        { tool: "tool-b", calls: 10, totalTime: 5000, times: [], avg: 500, p50: 400, p95: 600, p99: 800 },
        { tool: "tool-c", calls: 10, totalTime: 2000, times: [], avg: 200, p50: 150, p95: 250, p99: 350 },
      ],
    }
    await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify(perfData))

    const result = await perfTool.execute({ subcommand: "top 2" }, ctx)
    expect(result.output).toContain("tool-a")
    expect(result.output).toContain("tool-b")
    expect(result.output).not.toContain("tool-c")
  })

  it("resets perf data", async () => {
    const perfDir = path.join(worktree, ".opencode")
    await fs.mkdir(perfDir, { recursive: true })
    const perfData = {
      lastUpdated: "2026-08-23T05:00:00.000Z",
      stats: [
        { tool: "test", calls: 5, totalTime: 1000, times: [], avg: 200, p50: 150, p95: 300, p99: 400 },
      ],
    }
    await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify(perfData))

    const result = await perfTool.execute({ subcommand: "reset" }, ctx)
    expect(result.title).toBe("Performance Reset")
    expect(result.output).toContain("cleared")

    const content = await fs.readFile(path.join(perfDir, "perf.json"), "utf-8")
    const reset = JSON.parse(content)
    expect(reset.stats).toHaveLength(0)
  })

  it("shows recommendations for slow tools", async () => {
    const perfDir = path.join(worktree, ".opencode")
    await fs.mkdir(perfDir, { recursive: true })
    const perfData = {
      lastUpdated: "2026-08-23T05:00:00.000Z",
      stats: [
        { tool: "slow-tool", calls: 10, totalTime: 30000, times: [], avg: 3000, p50: 2500, p95: 3500, p99: 4000 },
      ],
    }
    await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify(perfData))

    const result = await perfTool.execute({}, ctx)
    expect(result.output).toContain("Recommendations")
    expect(result.output).toContain("Consider caching")
  })

  it("handles empty stats array", async () => {
    const perfDir = path.join(worktree, ".opencode")
    await fs.mkdir(perfDir, { recursive: true })
    const perfData = { lastUpdated: "2026-08-23T05:00:00.000Z", stats: [] }
    await fs.writeFile(path.join(perfDir, "perf.json"), JSON.stringify(perfData))

    const result = await perfTool.execute({}, ctx)
    expect(result.output).toContain("No performance data collected yet")
  })
})
