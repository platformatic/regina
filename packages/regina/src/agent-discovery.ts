import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

export interface AgentDefinition {
  id: string
  name: string
  description?: string
  model: string
  provider?: string
  tools: string[]
  delegates?: string[]
  mcpServers?: Array<{
    name: string
    transport: string
    url: string
    headers?: Record<string, string>
  }>
  temperature?: number
  maxSteps?: number
  greeting?: string
  systemPrompt: string
  filePath: string
}

export function parseFrontmatter (content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    throw new Error('Invalid agent definition: missing YAML frontmatter')
  }
  return {
    frontmatter: parseYaml(match[1]) as Record<string, unknown>,
    body: match[2].trim()
  }
}

function validateDefinition (frontmatter: Record<string, unknown>, filePath: string): void {
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error(`Agent definition ${filePath} is missing required field: name`)
  }
  if (!frontmatter.model || typeof frontmatter.model !== 'string') {
    throw new Error(`Agent definition ${filePath} is missing required field: model`)
  }
}

export function parseAgentDefinition (content: string, filePath: string): AgentDefinition {
  const { frontmatter, body } = parseFrontmatter(content)
  validateDefinition(frontmatter, filePath)

  const tools = Array.isArray(frontmatter.tools) ? frontmatter.tools.map((t: unknown) => String(t)) : []

  const delegates = Array.isArray(frontmatter.delegates)
    ? frontmatter.delegates.map((d: unknown) => String(d))
    : undefined

  const mcpServers = Array.isArray(frontmatter.mcpServers)
    ? (frontmatter.mcpServers as AgentDefinition['mcpServers'])
    : undefined

  return {
    ...frontmatter,
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

export async function discoverAgents (agentsDir: string): Promise<Map<string, AgentDefinition>> {
  const registry = new Map<string, AgentDefinition>()
  const resolvedDir = resolve(agentsDir)

  let entries: string[]
  try {
    entries = await readdir(resolvedDir)
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return registry
    }
    throw err
  }

  const mdFiles = entries.filter(f => f.endsWith('.md'))

  for (const file of mdFiles) {
    const filePath = resolve(resolvedDir, file)
    const content = await readFile(filePath, 'utf-8')
    const definition = parseAgentDefinition(content, filePath)
    registry.set(definition.id, definition)
  }

  return registry
}
