import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import type { ToolContext } from "@opencode-ai/plugin"

export function mockContext(worktree: string): ToolContext {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory: worktree,
    worktree,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

export async function createTempWorktree(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sdd-test-"))
  const specMemory = path.join(dir, ".opencode", "spec-memory")
  await fs.mkdir(specMemory, { recursive: true })
  await fs.writeFile(path.join(specMemory, "constitution.md"), "# Test Constitution\n", "utf-8")
  return dir
}

export async function destroyTempWorktree(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}
