import type { z } from "zod"

export * from "../../../node_modules/@opencode-ai/plugin/dist/index"

export type TestHookFn = (...args: any[]) => Promise<any>
export type TestHooks = Record<string, TestHookFn>
export type Plugin = (input: any, options?: Record<string, unknown>) => Promise<TestHooks>

export interface TestToolInputResponse {
  title?: string
  output: string
  metadata?: any
  attachments?: Array<{ type: "file"; mime: string; url: string; filename?: string }>
}

export interface TestToolResponse {
  title?: string
  output: string
  metadata: any
  attachments?: Array<{ type: "file"; mime: string; url: string; filename?: string }>
}

export declare function tool<Args extends z.ZodRawShape>(input: {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: any): Promise<TestToolInputResponse>
}): {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: any): Promise<TestToolResponse>
}

export declare namespace tool {
  var schema: typeof z
}
