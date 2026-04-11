import { basename } from 'node:path'
import type { CoreTool } from 'ai'

function isValidTool (obj: unknown): obj is CoreTool {
  if (!obj || typeof obj !== 'object') return false
  const tool = obj as Record<string, unknown>
  return typeof tool.execute === 'function' || typeof tool.parameters === 'object'
}

export async function loadTools (toolPaths: string[]): Promise<Record<string, CoreTool>> {
  const tools: Record<string, CoreTool> = {}

  for (const toolPath of toolPaths) {
    const mod = await import(toolPath)
    const tool = mod.default ?? mod

    if (!isValidTool(tool)) {
      throw new Error(`Tool at ${toolPath} does not export a valid AI SDK tool`)
    }

    const name = basename(toolPath).replace(/\.[^.]+$/, '')
    tools[name] = tool
  }

  return tools
}
