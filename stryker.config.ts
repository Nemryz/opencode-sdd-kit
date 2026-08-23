import type { MutatorOptions, StrykerOptions } from "@stryker-mutator/api/core"

const config: StrykerOptions = {
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress", "json"],
  testRunner: "vitest",
  testRunnerNodeArgs: ["--experimental-vm-modules"],
  coverageAnalysis: "perTest",
  tsconfigFile: "tsconfig.json",
  mutate: [
    "tools/shared/io.ts",
    "tools/shared/schemas.ts",
    "tools/shared/types.ts",
    "tools/speckit-audit.ts",
    "tools/speckit-clean.ts",
    "tools/speckit-delta.ts",
    "tools/speckit-health.ts",
    "tools/speckit-validate.ts",
    "tools/speckit-scaffold.ts",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
  timeoutMS: 30000,
  concurrency: 2,
  checkers: ["typescript"],
  typescriptChecker: {
    target: "tsconfig.json",
  },
}

export default config
