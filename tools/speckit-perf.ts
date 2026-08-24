import { tool } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import path from "node:path"
import { getRecommendations } from "./plugins/speckit-perfmon"

type PerfStats = {
  tool: string
  calls: number
  totalTime: number
  times: number[]
  p50: number
  p95: number
  p99: number
  avg: number
}

type PerfData = {
  lastUpdated: string
  stats: PerfStats[]
}

async function readPerfData(perfPath: string): Promise<PerfData | null> {
  try {
    const content = await fs.readFile(perfPath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function resetPerfData(perfPath: string): Promise<void> {
  const empty: PerfData = { lastUpdated: new Date().toISOString(), stats: [] }
  await fs.mkdir(path.dirname(perfPath), { recursive: true })
  await fs.writeFile(perfPath, JSON.stringify(empty, null, 2))
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

export default tool({
  description: "Show performance statistics for all tools",
  args: {
    subcommand: tool.schema.string().optional().describe("Subcommand: 'top N' for top N slowest, 'reset' to clear stats"),
  },
  async execute(args, context) {
    const perfPath = path.join(context.worktree, ".opencode", "perf.json")
    const subcommand = args.subcommand?.trim()

    if (subcommand === "reset") {
      await resetPerfData(perfPath)
      return {
        title: "Performance Reset",
        output: "Performance statistics have been cleared.",
      }
    }

    const data = await readPerfData(perfPath)
    if (!data || data.stats.length === 0) {
      return {
        title: "Performance Data",
        output: "No performance data collected yet. Use tools and check back later.",
      }
    }

    let topN = data.stats.length
    if (subcommand?.startsWith("top ")) {
      const n = parseInt(subcommand.slice(4), 10)
      if (!isNaN(n) && n > 0) topN = n
    }

    const sorted = [...data.stats].sort((a, b) => b.p99 - a.p99)
    const display = sorted.slice(0, topN)

    const lines = display.map(s =>
      `  ${s.tool}: avg ${formatDuration(s.avg)}, p95 ${formatDuration(s.p95)}, p99 ${formatDuration(s.p99)} (${s.calls} calls)`
    )

    const slowest = sorted[0]
    const recommendations = getRecommendations(data)

    const output: string[] = [
      `Last updated: ${data.lastUpdated}`,
      "",
      ...lines,
      "",
      `Slowest: ${slowest.tool} (p99: ${formatDuration(slowest.p99)})`,
    ]

    if (recommendations.length > 0) {
      output.push("", "Recommendations:", ...recommendations)
    }

    return {
      title: "Tool Performance Report",
      output: output.join("\n"),
    }
  },
})
