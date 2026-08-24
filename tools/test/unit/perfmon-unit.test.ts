import { describe, it, expect } from "vitest"
import { getRecommendations, calculatePercentileExport } from "../../plugins/speckit-perfmon"

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

describe("speckit-perfmon unit tests", () => {
  describe("calculatePercentileExport", () => {
    it("returns 0 for empty array", () => {
      expect(calculatePercentileExport([], 0.5)).toBe(0)
    })

    it("returns correct p50 for odd-length array", () => {
      const sorted = [1, 2, 3, 4, 5]
      expect(calculatePercentileExport(sorted, 0.5)).toBe(3)
    })

    it("returns correct p50 for even-length array", () => {
      const sorted = [1, 2, 3, 4]
      expect(calculatePercentileExport(sorted, 0.5)).toBe(3)
    })

    it("returns correct p95", () => {
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1)
      expect(calculatePercentileExport(sorted, 0.95)).toBe(96)
    })

    it("returns correct p99", () => {
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1)
      expect(calculatePercentileExport(sorted, 0.99)).toBe(100)
    })

    it("returns last element for percentile 1.0", () => {
      const sorted = [10, 20, 30]
      expect(calculatePercentileExport(sorted, 1.0)).toBe(30)
    })
  })

  describe("getRecommendations", () => {
    it("returns empty array for no stats", () => {
      const data: PerfData = { lastUpdated: "", stats: [] }
      expect(getRecommendations(data)).toHaveLength(0)
    })

    it("recommends caching for slow p99", () => {
      const data: PerfData = {
        lastUpdated: "",
        stats: [{
          tool: "test-tool",
          calls: 10,
          totalTime: 30000,
          times: [],
          avg: 3000,
          p50: 2500,
          p95: 3500,
          p99: 4000,
        }],
      }
      const recs = getRecommendations(data)
      expect(recs.some(r => r.includes("Consider caching"))).toBe(true)
    })

    it("recommends checking I/O for high variance", () => {
      const data: PerfData = {
        lastUpdated: "",
        stats: [{
          tool: "test-tool",
          calls: 10,
          totalTime: 6000,
          times: [],
          avg: 600,
          p50: 100,
          p95: 800,
          p99: 600,
        }],
      }
      const recs = getRecommendations(data)
      expect(recs.some(r => r.includes("High variance"))).toBe(true)
    })

    it("recommends optimization for frequently slow tools", () => {
      const data: PerfData = {
        lastUpdated: "",
        stats: [{
          tool: "test-tool",
          calls: 150,
          totalTime: 90000,
          times: [],
          avg: 600,
          p50: 500,
          p95: 700,
          p99: 800,
        }],
      }
      const recs = getRecommendations(data)
      expect(recs.some(r => r.includes("Frequently slow"))).toBe(true)
    })

    it("returns no recommendations for fast tools", () => {
      const data: PerfData = {
        lastUpdated: "",
        stats: [{
          tool: "fast-tool",
          calls: 50,
          totalTime: 1000,
          times: [],
          avg: 20,
          p50: 15,
          p95: 30,
          p99: 40,
        }],
      }
      const recs = getRecommendations(data)
      expect(recs).toHaveLength(0)
    })
  })
})
