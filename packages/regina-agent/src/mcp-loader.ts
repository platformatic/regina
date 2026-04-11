import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import type { CoreTool } from 'ai'

export interface McpServerConfig {
  name: string
  transport: 'sse' | 'http'
  url: string
  headers?: Record<string, string>
}

export interface McpConnection {
  tools: Record<string, CoreTool>
  close: () => Promise<void>
}

export interface LoadMcpServersOptions {
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void }
  /** @internal for testing */
  _createClient?: typeof createMCPClient
}

export async function loadMcpServers (configs: McpServerConfig[], options?: LoadMcpServersOptions): Promise<McpConnection> {
  const create = options?._createClient ?? createMCPClient
  const logger = options?.logger
  const clients: MCPClient[] = []
  const allTools: Record<string, CoreTool> = {}

  for (const config of configs) {
    let client: MCPClient
    try {
      client = await create({
        transport: {
          type: config.transport,
          url: config.url,
          headers: config.headers
        }
      })
    } catch (err) {
      logger?.warn({ server: config.name, err }, 'Failed to connect to MCP server, skipping')
      continue
    }

    clients.push(client)

    const tools = await client.tools()
    for (const [name, tool] of Object.entries(tools)) {
      allTools[`${config.name}_${name}`] = tool as unknown as CoreTool
    }
  }

  return {
    tools: allTools,
    close: async () => {
      await Promise.all(clients.map(c => c.close()))
    }
  }
}
