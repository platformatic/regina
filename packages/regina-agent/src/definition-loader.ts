import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { McpServerConfig } from './mcp-loader.ts'

export interface AgentDefinition {
  id: string
  name: string
  description?: string
  model: string
  provider?: string
  tools: string[]
  delegates?: string[]
  mcpServers?: McpServerConfig[]
  temperature?: number
  maxSteps?: number
  greeting?: string
  systemPrompt: string
  filePath: string
}

function parseFrontmatter (content: string): { frontmatter: Record<string, unknown>, body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    throw new Error('Invalid agent definition: missing YAML frontmatter')
  }
  return {
    frontmatter: parseYaml(match[1]) as Record<string, unknown>,
    body: match[2].trim()
  }
}

export async function loadDefinition (definitionPath: string): Promise<AgentDefinition> {
  const filePath = resolve(definitionPath)
  const content = await readFile(filePath, 'utf-8')
  const { frontmatter, body } = parseFrontmatter(content)

  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error(`Agent definition ${filePath} is missing required field: name`)
  }
  if (!frontmatter.model || typeof frontmatter.model !== 'string') {
    throw new Error(`Agent definition ${filePath} is missing required field: model`)
  }

  const baseDir = dirname(filePath)
  const tools = Array.isArray(frontmatter.tools)
    ? frontmatter.tools.map((t: unknown) => resolve(baseDir, String(t)))
    : []

  const delegates = Array.isArray(frontmatter.delegates)
    ? frontmatter.delegates.map((d: unknown) => String(d))
    : undefined

  const mcpServers = Array.isArray(frontmatter.mcpServers)
    ? frontmatter.mcpServers as McpServerConfig[]
    : undefined

  return {
    id: frontmatter.name as string,
    name: frontmatter.name as string,
    description: frontmatter.description as string | undefined,
    model: frontmatter.model as string,
    provider: frontmatter.provider as string | undefined,
    tools,
    delegates,
    mcpServers,
    temperature: frontmatter.temperature as number | undefined,
    maxSteps: frontmatter.maxSteps as number | undefined,
    greeting: frontmatter.greeting as string | undefined,
    systemPrompt: body,
    filePath
  }
}
