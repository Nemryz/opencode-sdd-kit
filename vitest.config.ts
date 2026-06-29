import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tools/test/**/*.test.ts"],
    testTimeout: 15000,
  },
})
