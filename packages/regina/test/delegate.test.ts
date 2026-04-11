import { strictEqual, ok } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Fastify from 'fastify'
import type { AgentDefinition } from '../src/agent-discovery.ts'
import { InstanceManager } from '../src/instance-manager.ts'
import { delegateRoutes } from '../src/routes/delegate.ts'

function createDefinitions (): Map<string, AgentDefinition> {
  const defs = new Map<string, AgentDefinition>()
  defs.set('orchestrator', {
    id: 'orchestrator',
    name: 'orchestrator',
    model: 'claude-sonnet-4-5',
    tools: [],
    delegates: ['research-agent'],
    systemPrompt: 'You orchestrate.',
    filePath: '/tmp/orchestrator.md'
  })
  defs.set('research-agent', {
    id: 'research-agent',
    name: 'research-agent',
    model: 'claude-sonnet-4-5',
    tools: [],
    systemPrompt: 'You research.',
    filePath: '/tmp/research-agent.md'
  })
  defs.set('writer-agent', {
    id: 'writer-agent',
    name: 'writer-agent',
    model: 'claude-sonnet-4-5',
    tools: [],
    systemPrompt: 'You write.',
    filePath: '/tmp/writer-agent.md'
  })
  return defs
}

function createMockManagement () {
  return {
    async addApplications () {},
    async removeApplications () {},
    async stopApplication () {},
    async startApplication () {}
  }
}

async function createTestRoot (t: any): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'regina-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function buildApp (definitions: Map<string, AgentDefinition>, instanceManager: InstanceManager) {
  const app = Fastify()
  app.decorate('agentDefinitions', definitions)
  app.decorate('instanceManager', instanceManager)
  await app.register(delegateRoutes)
  return app
}

test('delegate route - returns 404 for unknown agent type', async t => {
  const defs = createDefinitions()
  const mgmt = createMockManagement()
  const testRoot = await createTestRoot(t)
  const manager = new InstanceManager({ definitions: defs, management: mgmt, root: testRoot, config: {} })
  const app = await buildApp(defs, manager)
  t.after(() => app.close())

  // Spawn an orchestrator instance so we have a caller
  const caller = await manager.spawnInstance('orchestrator')

  const res = await app.inject({
    method: 'POST',
    url: '/delegate',
    payload: { agentType: 'nonexistent', message: 'hello', callerInstanceId: caller.instanceId }
  })

  strictEqual(res.statusCode, 404)
  ok(res.json().error.includes('not found'))
})

test('delegate route - returns 403 when caller not found', async t => {
  const defs = createDefinitions()
  const mgmt = createMockManagement()
  const testRoot = await createTestRoot(t)
  const manager = new InstanceManager({ definitions: defs, management: mgmt, root: testRoot, config: {} })
  const app = await buildApp(defs, manager)
  t.after(() => app.close())

  const res = await app.inject({
    method: 'POST',
    url: '/delegate',
    payload: { agentType: 'research-agent', message: 'hello', callerInstanceId: 'nonexistent-id' }
  })

  strictEqual(res.statusCode, 403)
})

test('delegate route - returns 403 when caller not allowed to delegate', async t => {
  const defs = createDefinitions()
  const mgmt = createMockManagement()
  const testRoot = await createTestRoot(t)
  const manager = new InstanceManager({ definitions: defs, management: mgmt, root: testRoot, config: {} })
  const app = await buildApp(defs, manager)
  t.after(() => app.close())

  // research-agent has no delegates
  const caller = await manager.spawnInstance('research-agent')

  const res = await app.inject({
    method: 'POST',
    url: '/delegate',
    payload: { agentType: 'writer-agent', message: 'hello', callerInstanceId: caller.instanceId }
  })

  strictEqual(res.statusCode, 403)
  ok(res.json().error.includes('not allowed'))
})

test('delegate route - returns 400 when max depth exceeded', async t => {
  const defs = createDefinitions()
  const mgmt = createMockManagement()
  const testRoot = await createTestRoot(t)
  const manager = new InstanceManager({ definitions: defs, management: mgmt, root: testRoot, config: {} })
  const app = await buildApp(defs, manager)
  t.after(() => app.close())

  const caller = await manager.spawnInstance('orchestrator')

  const res = await app.inject({
    method: 'POST',
    url: '/delegate',
    headers: { 'x-delegation-depth': '5' },
    payload: { agentType: 'research-agent', message: 'hello', callerInstanceId: caller.instanceId }
  })

  strictEqual(res.statusCode, 400)
  ok(res.json().error.includes('depth'))
})

test('delegate route - reuses existing started instance', async t => {
  const defs = createDefinitions()
  let addCount = 0
  const mgmt = {
    async addApplications () {
      addCount++
    },
    async removeApplications () {},
    async stopApplication () {},
    async startApplication () {}
  }
  const testRoot = await createTestRoot(t)
  const manager = new InstanceManager({ definitions: defs, management: mgmt, root: testRoot, config: {} })

  // Pre-spawn a research-agent so findOrSpawnInstance finds it
  await manager.spawnInstance('research-agent')
  strictEqual(addCount, 1)

  // The route will call findOrSpawnInstance which should reuse, not spawn
  const instances = manager.listInstances('research-agent')
  strictEqual(instances.length, 1)
  strictEqual(instances[0].status, 'started')

  const result = await manager.findOrSpawnInstance('research-agent')
  strictEqual(result.instanceId, instances[0].instanceId)
  strictEqual(addCount, 1) // No new spawn
})
