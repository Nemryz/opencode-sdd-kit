import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  detectPackageManager,
  detectFramework,
  detectConfigFiles,
  detectScripts,
  discoverProject,
  ProjectContext,
} from "../../shared/types"

let tmp: string

async function worktree(): Promise<string> {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "discovery-"))
  return tmp
}

async function writePkg(dir: string, content: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify(content), "utf-8")
}

afterEach(async () => {
  if (tmp) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

// ── detectPackageManager ─────────────────────────────────

describe("detectPackageManager", () => {
  it("detects npm from package-lock.json", async () => {
    const t = await worktree()
    await fs.writeFile(path.join(t, "package-lock.json"), "{}", "utf-8")
    await expect(detectPackageManager(t)).resolves.toBe("npm")
  })

  it("detects yarn from yarn.lock", async () => {
    const t = await worktree()
    await fs.writeFile(path.join(t, "yarn.lock"), "", "utf-8")
    await expect(detectPackageManager(t)).resolves.toBe("yarn")
  })

  it("detects pnpm from pnpm-lock.yaml", async () => {
    const t = await worktree()
    await fs.writeFile(path.join(t, "pnpm-lock.yaml"), "", "utf-8")
    await expect(detectPackageManager(t)).resolves.toBe("pnpm")
  })

  it("detects bun from bun.lockb", async () => {
    const t = await worktree()
    await fs.writeFile(path.join(t, "bun.lockb"), "", "utf-8")
    await expect(detectPackageManager(t)).resolves.toBe("bun")
  })

  it("returns unknown when no lock file", async () => {
    const t = await worktree()
    await expect(detectPackageManager(t)).resolves.toBe("unknown")
  })
})

// ── detectFramework ─────────────────────────────────────

describe("detectFramework", () => {
  it("detects react", async () => {
    await expect(detectFramework("", ["react"])).resolves.toBe("react")
  })

  it("detects next from next dependency", async () => {
    await expect(detectFramework("", ["next"])).resolves.toBe("next")
  })

  it("detects next from @next/ something", async () => {
    await expect(detectFramework("", ["@next/env"])).resolves.toBe("next")
  })

  it("detects express", async () => {
    await expect(detectFramework("", ["express"])).resolves.toBe("express")
  })

  it("detects vite", async () => {
    await expect(detectFramework("", ["vite"])).resolves.toBe("vite")
  })

  it("returns null for empty dependencies", async () => {
    await expect(detectFramework("", [])).resolves.toBeNull()
  })

  it("returns null for unknown dependencies", async () => {
    await expect(detectFramework("", ["lodash", "axios"])).resolves.toBeNull()
  })
})

// ── detectConfigFiles ───────────────────────────────────

describe("detectConfigFiles", () => {
  it("finds tsconfig.json and vitest config", async () => {
    const t = await worktree()
    await fs.writeFile(path.join(t, "tsconfig.json"), "{}", "utf-8")
    await fs.writeFile(path.join(t, "vitest.config.ts"), "", "utf-8")
    const result = await detectConfigFiles(t)
    expect(result).toContain("tsconfig.json")
    expect(result).toContain("vitest.config.ts")
  })

  it("returns empty array when no config files exist", async () => {
    const t = await worktree()
    await expect(detectConfigFiles(t)).resolves.toEqual([])
  })
})

// ── detectScripts ──────────────────────────────────────

describe("detectScripts", () => {
  it("reads scripts, dependencies, devDependencies from package.json", async () => {
    const t = await worktree()
    await writePkg(t, {
      scripts: { test: "vitest", build: "tsc" },
      dependencies: { react: "^18" },
      devDependencies: { vitest: "^1" },
    })
    const result = await detectScripts(t)
    expect(result.scripts).toEqual(["test", "build"])
    expect(result.dependencies).toEqual(["react"])
    expect(result.devDependencies).toEqual(["vitest"])
  })

  it("returns empty arrays when no package.json", async () => {
    const t = await worktree()
    const result = await detectScripts(t)
    expect(result).toEqual({ scripts: [], dependencies: [], devDependencies: [] })
  })

  it("returns empty arrays when package.json has no scripts or deps", async () => {
    const t = await worktree()
    await writePkg(t, { name: "test" })
    const result = await detectScripts(t)
    expect(result.scripts).toEqual([])
    expect(result.dependencies).toEqual([])
    expect(result.devDependencies).toEqual([])
  })
})

// ── discoverProject (integration) ───────────────────────

describe("discoverProject", () => {
  it("discovers a react project with npm", async () => {
    const t = await worktree()
    await fs.writeFile(path.join(t, "package-lock.json"), "{}", "utf-8")
    await writePkg(t, {
      scripts: { test: "vitest", dev: "vite" },
      dependencies: { react: "^18", reactDom: "^18" },
      devDependencies: { vitest: "^1", typescript: "^5" },
    })
    await fs.writeFile(path.join(t, "tsconfig.json"), "{}", "utf-8")
    await fs.writeFile(path.join(t, ".eslintrc.json"), "{}", "utf-8")
    const result = await discoverProject(t)
    expect(result.packageManager).toBe("npm")
    expect(result.framework).toBe("react")
    expect(result.hasTypeScript).toBe(true)
    expect(result.hasESLint).toBe(true)
    expect(result.hasTestingFramework).toBe(true)
    expect(result.configFiles).toContain("tsconfig.json")
    expect(result.configFiles).toContain(".eslintrc.json")
    expect(result.scripts).toContain("test")
    expect(result.dependencies).toContain("react")
    expect(result.devDependencies).toContain("typescript")
  })

  it("discovers a vite project with pnpm", async () => {
    const t = await worktree()
    await fs.writeFile(path.join(t, "pnpm-lock.yaml"), "", "utf-8")
    await writePkg(t, {
      scripts: { dev: "vite", build: "vite build" },
      dependencies: { vite: "^5" },
    })
    const result = await discoverProject(t)
    expect(result.packageManager).toBe("pnpm")
    expect(result.framework).toBe("vite")
    expect(result.hasTypeScript).toBe(false)
    expect(result.scripts).toContain("dev")
  })

  it("returns unknown package manager and null framework for empty project", async () => {
    const t = await worktree()
    const result = await discoverProject(t)
    expect(result.packageManager).toBe("unknown")
    expect(result.framework).toBeNull()
    expect(result.hasTypeScript).toBe(false)
    expect(result.configFiles).toEqual([])
    expect(result.scripts).toEqual([])
  })

  it("detects testing framework from devDependencies", async () => {
    const t = await worktree()
    await writePkg(t, {
      devDependencies: { vitest: "^1" },
    })
    const result = await discoverProject(t)
    expect(result.hasTestingFramework).toBe(true)
  })
})
