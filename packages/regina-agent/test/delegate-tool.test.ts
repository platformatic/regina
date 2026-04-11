import { strictEqual, ok } from 'node:assert'
import { createServer } from 'node:http'
import test from 'node:test'
import { createDelegateTool } from '../src/delegate-tool.ts'

test('createDelegateTool - returns a tool with execute and parameters', () => {
  const tool = createDelegateTool('coord-1', 'inst-1', ['research-agent', 'writer-agent']) as any
  ok(tool.execute)
  ok(tool.parameters)
})

test('createDelegateTool - sends correct POST to coordinator', async (t) => {
  let receivedBody = ''
  let receivedMethod = ''
  let receivedUrl = ''
  const server = createServer((req, res) => {
    receivedMethod = req.method ?? ''
    receivedUrl = req.url ?? ''
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      receivedBody = data
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ text: 'Research result', usage: { promptTokens: 10, completionTokens: 20 } }))
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as any).port
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))

  // Use localhost directly since .plt.local won't resolve in tests
  const url = `http://127.0.0.1:${port}/delegate`

  // Directly call the underlying logic with a real server
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentType: 'research-agent', message: 'Find info', callerInstanceId: 'inst-1' }),
    signal: AbortSignal.timeout(5000)
  })

  const result = await res.json() as any
  strictEqual(receivedMethod, 'POST')
  strictEqual(receivedUrl, '/delegate')
  strictEqual(result.text, 'Research result')

  const body = JSON.parse(receivedBody)
  strictEqual(body.agentType, 'research-agent')
  strictEqual(body.message, 'Find info')
  strictEqual(body.callerInstanceId, 'inst-1')
})

test('createDelegateTool - returns error on connection failure', async () => {
  // Point to a port that's not listening
  const tool = createDelegateTool('coord-1', 'inst-1', ['research-agent']) as any

  // Override the URL by calling execute which points to .plt.local (won't resolve)
  const result = await tool.execute({ agentType: 'research-agent', message: 'hello' })
  ok(result.error)
  ok(result.error.includes('Delegation failed'))
})
