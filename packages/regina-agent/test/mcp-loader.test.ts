import { strictEqual, deepStrictEqual, ok } from 'node:assert'
import test from 'node:test'
import { loadMcpServers, type McpServerConfig } from '../src/mcp-loader.ts'

function fakeCreateClient (toolsByUrl: Record<string, Record<string, unknown>>) {
  return async (opts: any) => {
    const url = opts.transport.url
    const tools = toolsByUrl[url]
    if (!tools) {
      throw new Error(`Connection refused: ${url}`)
    }
    return {
      tools: async () => ({ ...tools }),
      close: async () => {}
    }
  }
}

test('loadMcpServers - loads tools from SSE server', async () => {
  const configs: McpServerConfig[] = [
    { name: 'web', transport: 'sse', url: 'http://localhost:3001/sse' }
  ]

  const conn = await loadMcpServers(configs, {
    _createClient: fakeCreateClient({
      'http://localhost:3001/sse': { search: { description: 'search tool' } }
    }) as any
  })
  ok(conn.tools['web_search'])
  strictEqual(Object.keys(conn.tools).length, 1)
  await conn.close()
})

test('loadMcpServers - loads tools from HTTP server with headers', async () => {
  const configs: McpServerConfig[] = [
    { name: 'api', transport: 'http', url: 'http://localhost:3002/mcp', headers: { Authorization: 'Bearer token' } }
  ]

  const conn = await loadMcpServers(configs, {
    _createClient: fakeCreateClient({
      'http://localhost:3002/mcp': { query: { description: 'query tool' } }
    }) as any
  })
  ok(conn.tools['api_query'])
  await conn.close()
})

test('loadMcpServers - merges tools from multiple servers with name prefixing', async () => {
  const configs: McpServerConfig[] = [
    { name: 'web', transport: 'sse', url: 'http://localhost:3001/sse' },
    { name: 'db', transport: 'http', url: 'http://localhost:3002/mcp' }
  ]

  const conn = await loadMcpServers(configs, {
    _createClient: fakeCreateClient({
      'http://localhost:3001/sse': { search: { description: 'search' }, fetch: { description: 'fetch' } },
      'http://localhost:3002/mcp': { query: { description: 'query' } }
    }) as any
  })
  deepStrictEqual(Object.keys(conn.tools).sort(), ['db_query', 'web_fetch', 'web_search'])
  await conn.close()
})

test('loadMcpServers - close() calls close on all clients', async () => {
  let closeCalls = 0
  const createClient = async () => ({
    tools: async () => ({}),
    close: async () => { closeCalls++ }
  })

  const configs: McpServerConfig[] = [
    { name: 'a', transport: 'sse', url: 'http://a/sse' },
    { name: 'b', transport: 'http', url: 'http://b/mcp' }
  ]

  const conn = await loadMcpServers(configs, { _createClient: createClient as any })
  await conn.close()
  strictEqual(closeCalls, 2)
})

test('loadMcpServers - handles server connection failure gracefully', async () => {
  const warnings: string[] = []
  const logger = { warn: (_obj: Record<string, unknown>, msg: string) => { warnings.push(msg) } }

  const configs: McpServerConfig[] = [
    { name: 'bad', transport: 'sse', url: 'http://localhost:3001/sse' },
    { name: 'good', transport: 'http', url: 'http://localhost:3002/mcp' }
  ]

  const conn = await loadMcpServers(configs, {
    logger,
    _createClient: fakeCreateClient({
      'http://localhost:3002/mcp': { query: { description: 'query' } }
    }) as any
  })
  strictEqual(Object.keys(conn.tools).length, 1)
  ok(conn.tools['good_query'])
  strictEqual(warnings.length, 1)
  ok(warnings[0].includes('Failed to connect'))
  await conn.close()
})

test('loadMcpServers - returns empty tools when all servers fail', async () => {
  const warnings: string[] = []
  const logger = { warn: (_obj: Record<string, unknown>, msg: string) => { warnings.push(msg) } }

  const configs: McpServerConfig[] = [
    { name: 'bad', transport: 'sse', url: 'http://localhost:9999/sse' }
  ]

  const conn = await loadMcpServers(configs, {
    logger,
    _createClient: fakeCreateClient({}) as any
  })
  strictEqual(Object.keys(conn.tools).length, 0)
  await conn.close()
})
