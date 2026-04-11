import { strictEqual, ok } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { create } from '../src/index.ts'

const agentMd = `---
name: test-agent
model: claude-sonnet-4-5
provider: anthropic
---

You are a test agent.`

async function setupTestServer (t: any) {
  const dir = await mkdtemp(join(tmpdir(), 'regina-int-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const agentsDir = join(dir, 'agents')
  const { mkdir } = await import('node:fs/promises')
  await mkdir(agentsDir)
  await writeFile(join(agentsDir, 'test-agent.md'), agentMd)

  const mockManagement = {
    added: [] as any[],
    removed: [] as string[][],
    async addApplications (apps: any[], start: boolean) {
      mockManagement.added.push({ apps, start })
    },
    async removeApplications (ids: string[]) {
      mockManagement.removed.push(ids)
    }
  }

  const previousPlatformatic = (globalThis as any).platformatic
  ;(globalThis as any).platformatic = { management: mockManagement }
  t.after(() => {
    if (previousPlatformatic) {
      (globalThis as any).platformatic = previousPlatformatic
    } else {
      delete (globalThis as any).platformatic
    }
  })

  const server = await create(dir, {
    server: { port: 0, logger: { level: 'silent' } },
    service: { openapi: true },
    regina: { agentsDir: './agents' }
  })

  await server.start()
  t.after(() => server.close())

  return { server, mockManagement }
}

test('GET /agents - lists discovered definitions', async (t) => {
  const { server } = await setupTestServer(t)
  const res = await server.inject({ method: 'GET', url: '/agents' })
  strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.body)
  strictEqual(body.length, 1)
  strictEqual(body[0].id, 'test-agent')
  strictEqual(body[0].model, 'claude-sonnet-4-5')
})

test('GET /agents/:defId - returns specific definition', async (t) => {
  const { server } = await setupTestServer(t)
  const res = await server.inject({ method: 'GET', url: '/agents/test-agent' })
  strictEqual(res.statusCode, 200)
  const body = JSON.parse(res.body)
  strictEqual(body.id, 'test-agent')
  strictEqual(body.name, 'test-agent')
})

test('GET /agents/:defId - returns 404 for unknown definition', async (t) => {
  const { server } = await setupTestServer(t)
  const res = await server.inject({ method: 'GET', url: '/agents/nonexistent' })
  strictEqual(res.statusCode, 404)
})

test('POST /agents/:defId/instances - spawns an instance', async (t) => {
  const { server, mockManagement } = await setupTestServer(t)
  const res = await server.inject({
    method: 'POST',
    url: '/agents/test-agent/instances',
    payload: {}
  })
  strictEqual(res.statusCode, 201)
  const body = JSON.parse(res.body)
  ok(body.instanceId.startsWith('test-agent-'))
  strictEqual(body.definitionId, 'test-agent')
  strictEqual(body.status, 'started')
  strictEqual(mockManagement.added.length, 1)
})

test('POST /agents/:defId/instances - returns 500 for unknown definition', async (t) => {
  const { server } = await setupTestServer(t)
  const res = await server.inject({
    method: 'POST',
    url: '/agents/nonexistent/instances',
    payload: {}
  })
  strictEqual(res.statusCode, 500)
})

test('GET /agents/:defId/instances - lists instances', async (t) => {
  const { server } = await setupTestServer(t)

  // No instances yet
  let res = await server.inject({ method: 'GET', url: '/agents/test-agent/instances' })
  strictEqual(res.statusCode, 200)
  strictEqual(JSON.parse(res.body).length, 0)

  // Spawn one
  await server.inject({
    method: 'POST',
    url: '/agents/test-agent/instances',
    payload: {}
  })

  res = await server.inject({ method: 'GET', url: '/agents/test-agent/instances' })
  strictEqual(res.statusCode, 200)
  strictEqual(JSON.parse(res.body).length, 1)
})

test('DELETE /instances/:instanceId - removes an instance', async (t) => {
  const { server, mockManagement } = await setupTestServer(t)

  const spawnRes = await server.inject({
    method: 'POST',
    url: '/agents/test-agent/instances',
    payload: {}
  })
  const { instanceId } = JSON.parse(spawnRes.body)

  const deleteRes = await server.inject({
    method: 'DELETE',
    url: `/instances/${instanceId}`
  })
  strictEqual(deleteRes.statusCode, 204)
  strictEqual(mockManagement.removed.length, 1)

  // Verify it's gone
  const listRes = await server.inject({ method: 'GET', url: '/agents/test-agent/instances' })
  strictEqual(JSON.parse(listRes.body).length, 0)
})

test('DELETE /instances/:instanceId - returns 500 for unknown instance', async (t) => {
  const { server } = await setupTestServer(t)
  const res = await server.inject({
    method: 'DELETE',
    url: '/instances/nonexistent'
  })
  strictEqual(res.statusCode, 500)
})

test('full lifecycle: spawn, list, remove', async (t) => {
  const { server } = await setupTestServer(t)

  // Spawn two instances
  const res1 = await server.inject({ method: 'POST', url: '/agents/test-agent/instances', payload: {} })
  const res2 = await server.inject({ method: 'POST', url: '/agents/test-agent/instances', payload: {} })
  const id1 = JSON.parse(res1.body).instanceId
  const id2 = JSON.parse(res2.body).instanceId
  ok(id1 !== id2)

  // List shows 2
  let listRes = await server.inject({ method: 'GET', url: '/agents/test-agent/instances' })
  strictEqual(JSON.parse(listRes.body).length, 2)

  // Remove first
  await server.inject({ method: 'DELETE', url: `/instances/${id1}` })
  listRes = await server.inject({ method: 'GET', url: '/agents/test-agent/instances' })
  strictEqual(JSON.parse(listRes.body).length, 1)
  strictEqual(JSON.parse(listRes.body)[0].instanceId, id2)

  // Remove second
  await server.inject({ method: 'DELETE', url: `/instances/${id2}` })
  listRes = await server.inject({ method: 'GET', url: '/agents/test-agent/instances' })
  strictEqual(JSON.parse(listRes.body).length, 0)
})
