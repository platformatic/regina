import { ok, strictEqual } from 'node:assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { AgentDefinition } from '../src/agent-discovery.ts'
import { InstanceManager } from '../src/instance-manager.ts'
import type { ReginaMetrics } from '../src/metrics.ts'
import type { StateBackup } from '../src/state-backup.ts'

async function createTestRoot (t: any): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'regina-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

function createMockDefinitions (): Map<string, AgentDefinition> {
  const defs = new Map<string, AgentDefinition>()
  defs.set('test-agent', {
    id: 'test-agent',
    name: 'test-agent',
    description: 'Test agent',
    model: 'claude-sonnet-4-5',
    tools: [],
    systemPrompt: 'You are a test agent.',
    filePath: '/tmp/test-agent.md'
  })
  return defs
}

function createMockManagement () {
  const added: any[] = []
  const removed: string[][] = []
  const stopped: string[] = []
  const started: string[] = []
  return {
    added,
    removed,
    stopped,
    started,
    async addApplications (apps: any[], start: boolean) {
      added.push({ apps, start })
    },
    async removeApplications (ids: string[]) {
      removed.push(ids)
    },
    async stopApplication (id: string) {
      stopped.push(id)
    },
    async startApplication (id: string) {
      started.push(id)
    }
  }
}

function createManager (
  defs: Map<string, AgentDefinition>,
  mgmt: ReturnType<typeof createMockManagement>,
  testRoot: string,
  options: {
    idleTimeout?: number
    coordinatorId?: string
    stateBackup?: StateBackup
    metrics?: ReginaMetrics | null
  } = {}
) {
  return new InstanceManager({
    definitions: defs,
    management: mgmt,
    root: testRoot,
    config: {},
    idleTimeout: options.idleTimeout,
    coordinatorId: options.coordinatorId,
    stateBackup: options.stateBackup,
    metrics: options.metrics
  })
}

async function readAddedConfig (mgmt: ReturnType<typeof createMockManagement>, index = 0) {
  const configPath = mgmt.added[index].apps[0].config
  ok(typeof configPath === 'string', 'config should be a file path')
  return JSON.parse(await readFile(configPath, 'utf-8'))
}

test('InstanceManager - spawns an instance', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const info = await manager.spawnInstance('test-agent')
  ok(info.instanceId.startsWith('test-agent-'))
  strictEqual(info.definitionId, 'test-agent')
  strictEqual(info.status, 'started')
  ok(info.createdAt instanceof Date)
  strictEqual(mgmt.added.length, 1)
  strictEqual(mgmt.added[0].start, true)

  const config = await readAddedConfig(mgmt)
  const addedConfig = config.reginaAgent
  ok(addedConfig.vfsDbPath, 'should have vfsDbPath')
  ok(addedConfig.vfsDbPath.includes(info.instanceId), 'vfsDbPath should contain instance id')
  ok(addedConfig.vfsDbPath.endsWith('.sqlite'), 'vfsDbPath should end with .sqlite')
})

test('InstanceManager - throws on unknown definition', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  try {
    await manager.spawnInstance('nonexistent')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('Agent definition not found'))
  }
})

test('InstanceManager - lists instances', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  strictEqual(manager.listInstances().length, 0)

  await manager.spawnInstance('test-agent')
  await manager.spawnInstance('test-agent')

  strictEqual(manager.listInstances().length, 2)
  strictEqual(manager.listInstances('test-agent').length, 2)
  strictEqual(manager.listInstances('other').length, 0)
})

test('InstanceManager - gets instance by id', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const info = await manager.spawnInstance('test-agent')
  const fetched = manager.getInstance(info.instanceId)
  ok(fetched)
  strictEqual(fetched!.instanceId, info.instanceId)
  strictEqual(manager.getInstance('nonexistent'), undefined)
})

test('InstanceManager - removes instance', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const info = await manager.spawnInstance('test-agent')
  strictEqual(manager.listInstances().length, 1)

  await manager.removeInstance(info.instanceId)
  strictEqual(manager.listInstances().length, 0)
  strictEqual(manager.getInstance(info.instanceId), undefined)
  strictEqual(mgmt.removed.length, 1)
  ok(mgmt.removed[0].includes(info.instanceId))
})

test('InstanceManager - throws on removing unknown instance', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  try {
    await manager.removeInstance('nonexistent')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('Instance not found'))
  }
})

test('InstanceManager - config file contains module field', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  await manager.spawnInstance('test-agent')
  const config = await readAddedConfig(mgmt)
  strictEqual(config.module, '@platformatic/regina-agent')
})

test('InstanceManager - generates unique instance ids', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const info1 = await manager.spawnInstance('test-agent')
  const info2 = await manager.spawnInstance('test-agent')
  ok(info1.instanceId !== info2.instanceId, 'instance ids should be unique')
})

test('InstanceManager - suspendInstance stops application and sets status', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const info = await manager.spawnInstance('test-agent')
  await manager.suspendInstance(info.instanceId)

  strictEqual(info.status, 'suspended')
  strictEqual(mgmt.stopped.length, 1)
  strictEqual(mgmt.stopped[0], info.instanceId)
})

test('InstanceManager - resumeInstance starts application and sets status', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const info = await manager.spawnInstance('test-agent')
  await manager.suspendInstance(info.instanceId)
  await manager.resumeInstance(info.instanceId)

  strictEqual(info.status, 'started')
  strictEqual(mgmt.started.length, 1)
  strictEqual(mgmt.started[0], info.instanceId)
})

test('InstanceManager - suspendInstance throws for unknown instance', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  try {
    await manager.suspendInstance('nonexistent')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('Instance not found'))
  }
})

test('InstanceManager - resumeInstance throws for unknown instance', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  try {
    await manager.resumeInstance('nonexistent')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('Instance not found'))
  }
})

test('InstanceManager - idle timeout auto-suspends instance', async t => {
  const testRoot = await createTestRoot(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })

  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 5000 })

  const info = await manager.spawnInstance('test-agent')
  strictEqual(info.status, 'started')

  t.mock.timers.tick(5000)
  await new Promise(resolve => setImmediate(resolve))

  strictEqual(info.status, 'suspended')
  strictEqual(mgmt.stopped.length, 1)
})

test('InstanceManager - refreshTimer resets the countdown', async t => {
  const testRoot = await createTestRoot(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })

  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 5000 })

  const info = await manager.spawnInstance('test-agent')

  t.mock.timers.tick(3000)
  manager.refreshTimer(info.instanceId)
  t.mock.timers.tick(4999)
  await new Promise(resolve => setImmediate(resolve))

  strictEqual(info.status, 'started', 'should still be started before full timeout after refresh')
  strictEqual(mgmt.stopped.length, 0)

  t.mock.timers.tick(1)
  await new Promise(resolve => setImmediate(resolve))

  strictEqual(info.status, 'suspended', 'should suspend after full timeout from refresh point')
  strictEqual(mgmt.stopped.length, 1)
})

test('InstanceManager - clearAllTimers prevents auto-suspend', async t => {
  const testRoot = await createTestRoot(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })

  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 5000 })

  const info = await manager.spawnInstance('test-agent')
  manager.clearAllTimers()

  t.mock.timers.tick(10000)
  await new Promise(resolve => setImmediate(resolve))

  strictEqual(info.status, 'started')
  strictEqual(mgmt.stopped.length, 0)
})

test('InstanceManager - passes coordinatorId and instanceId to agent config', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, coordinatorId: 'coordinator-abc' })

  const info = await manager.spawnInstance('test-agent')
  const config = await readAddedConfig(mgmt)
  strictEqual(config.reginaAgent.coordinatorId, 'coordinator-abc')
  strictEqual(config.reginaAgent.instanceId, info.instanceId)
})

test('InstanceManager - omits coordinatorId when not provided', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  await manager.spawnInstance('test-agent')
  const config = await readAddedConfig(mgmt)
  strictEqual(config.reginaAgent.coordinatorId, undefined)
  strictEqual(config.reginaAgent.instanceId, undefined)
})

test('InstanceManager - passes apiKey from env for anthropic model', async t => {
  const testRoot = await createTestRoot(t)
  const originalKey = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
  try {
    const defs = createMockDefinitions()
    const mgmt = createMockManagement()
    const manager = createManager(defs, mgmt, testRoot)

    await manager.spawnInstance('test-agent')
    const config = await readAddedConfig(mgmt)
    strictEqual(config.reginaAgent.apiKey, 'sk-ant-test-key')
  } finally {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey
    }
  }
})

test('InstanceManager - omits apiKey when env var is not set', async t => {
  const testRoot = await createTestRoot(t)
  const originalKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  try {
    const defs = createMockDefinitions()
    const mgmt = createMockManagement()
    const manager = createManager(defs, mgmt, testRoot)

    await manager.spawnInstance('test-agent')
    const config = await readAddedConfig(mgmt)
    strictEqual(config.reginaAgent.apiKey, undefined)
  } finally {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey
    }
  }
})

test('InstanceManager - passes apiKey for openai model', async t => {
  const testRoot = await createTestRoot(t)
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'sk-openai-test-key'
  try {
    const defs = createMockDefinitions()
    defs.set('gpt-agent', {
      id: 'gpt-agent',
      name: 'gpt-agent',
      description: 'GPT agent',
      model: 'gpt-4o',
      tools: [],
      systemPrompt: 'You are a test agent.',
      filePath: '/tmp/gpt-agent.md'
    })
    const mgmt = createMockManagement()
    const manager = createManager(defs, mgmt, testRoot)

    await manager.spawnInstance('gpt-agent')
    const config = await readAddedConfig(mgmt)
    strictEqual(config.reginaAgent.apiKey, 'sk-openai-test-key')
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalKey
    }
  }
})

test('InstanceManager - no timer when idleTimeout is 0', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0 })

  const info = await manager.spawnInstance('test-agent')
  manager.refreshTimer(info.instanceId)
  strictEqual(info.status, 'started')
})

test('InstanceManager - findOrSpawnInstance returns existing started instance', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const spawned = await manager.spawnInstance('test-agent')
  const found = await manager.findOrSpawnInstance('test-agent')

  strictEqual(found.instanceId, spawned.instanceId)
  strictEqual(mgmt.added.length, 1) // No extra spawn
})

test('InstanceManager - findOrSpawnInstance resumes suspended instance', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const spawned = await manager.spawnInstance('test-agent')
  await manager.suspendInstance(spawned.instanceId)
  strictEqual(spawned.status, 'suspended')

  const found = await manager.findOrSpawnInstance('test-agent')
  strictEqual(found.instanceId, spawned.instanceId)
  strictEqual(found.status, 'started')
  strictEqual(mgmt.started.length, 1)
  strictEqual(mgmt.added.length, 1) // No extra spawn
})

test('InstanceManager - findOrSpawnInstance spawns new when none exist', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const found = await manager.findOrSpawnInstance('test-agent')
  ok(found.instanceId.startsWith('test-agent-'))
  strictEqual(found.status, 'started')
  strictEqual(mgmt.added.length, 1)
})

test('InstanceManager - spawnInstance with existingInstanceId uses given ID', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const info = await manager.spawnInstance('test-agent', 'test-agent-abc123')
  strictEqual(info.instanceId, 'test-agent-abc123')
  strictEqual(info.definitionId, 'test-agent')
  strictEqual(info.status, 'started')
})

test('InstanceManager - restoreInstance returns null without stateBackup', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const manager = createManager(defs, mgmt, testRoot)

  const result = await manager.restoreInstance('test-agent-abc123')
  strictEqual(result, null)
})

test('InstanceManager - restoreInstance returns existing instance if already running', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const mockBackup = {
    restore: async () => true,
    backup: async () => {},
    cleanup: async () => {}
  } as unknown as StateBackup
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, stateBackup: mockBackup })

  const spawned = await manager.spawnInstance('test-agent', 'test-agent-abc123')
  const restored = await manager.restoreInstance('test-agent-abc123')
  ok(restored)
  strictEqual(restored!.instanceId, spawned.instanceId)
  strictEqual(mgmt.added.length, 1) // No extra spawn
})

test('InstanceManager - restoreInstance restores from storage and spawns', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const mockBackup = {
    restore: async () => true,
    backup: async () => {},
    cleanup: async () => {}
  } as unknown as StateBackup
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, stateBackup: mockBackup })

  const result = await manager.restoreInstance('test-agent-abc123')
  ok(result)
  strictEqual(result!.instanceId, 'test-agent-abc123')
  strictEqual(result!.definitionId, 'test-agent')
  strictEqual(result!.status, 'started')
  strictEqual(mgmt.added.length, 1)
})

test('InstanceManager - restoreInstance returns null when storage has no backup', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const mockBackup = {
    restore: async () => false,
    backup: async () => {},
    cleanup: async () => {}
  } as unknown as StateBackup
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, stateBackup: mockBackup })

  const result = await manager.restoreInstance('test-agent-abc123')
  strictEqual(result, null)
  strictEqual(mgmt.added.length, 0)
})

function createMockMetrics () {
  const calls: { method: string; labels: any; value?: number }[] = []
  const makeCounter = () => ({
    inc (labels: any, value?: number) {
      calls.push({ method: 'inc', labels, value })
    }
  })
  const makeGauge = () => ({
    inc (labels: any) {
      calls.push({ method: 'gauge.inc', labels })
    },
    dec (labels: any) {
      calls.push({ method: 'gauge.dec', labels })
    }
  })
  const makeHistogram = () => ({
    startTimer (labels: any) {
      calls.push({ method: 'startTimer', labels })
      return () => {
        calls.push({ method: 'stopTimer', labels })
        return 0
      }
    }
  })

  const metrics: ReginaMetrics = {
    instancesActive: makeGauge(),
    instanceSpawnsTotal: makeCounter(),
    instanceRemovalsTotal: makeCounter(),
    instanceSuspensionsTotal: makeCounter(),
    instanceResumesTotal: makeCounter(),
    instanceSpawnDuration: makeHistogram()
  }
  return { metrics, calls }
}

test('InstanceManager - spawnInstance records metrics', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const { metrics, calls } = createMockMetrics()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, metrics })

  await manager.spawnInstance('test-agent')

  ok(
    calls.some(c => c.method === 'inc' && c.labels.definition_id === 'test-agent'),
    'should increment spawns counter'
  )
  ok(
    calls.some(c => c.method === 'startTimer'),
    'should start spawn timer'
  )
  ok(
    calls.some(c => c.method === 'stopTimer'),
    'should stop spawn timer'
  )
  ok(
    calls.some(c => c.method === 'gauge.inc' && c.labels.status === 'started'),
    'should increment active gauge'
  )
})

test('InstanceManager - suspendInstance records metrics', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const { metrics, calls } = createMockMetrics()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, metrics })

  const info = await manager.spawnInstance('test-agent')
  calls.length = 0 // reset

  await manager.suspendInstance(info.instanceId)

  ok(
    calls.some(c => c.method === 'inc' && c.labels.definition_id === 'test-agent'),
    'should increment suspensions counter'
  )
  ok(
    calls.some(c => c.method === 'gauge.dec' && c.labels.status === 'started'),
    'should decrement started gauge'
  )
  ok(
    calls.some(c => c.method === 'gauge.inc' && c.labels.status === 'suspended'),
    'should increment suspended gauge'
  )
})

test('InstanceManager - resumeInstance records metrics', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const { metrics, calls } = createMockMetrics()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, metrics })

  const info = await manager.spawnInstance('test-agent')
  await manager.suspendInstance(info.instanceId)
  calls.length = 0 // reset

  await manager.resumeInstance(info.instanceId)

  ok(
    calls.some(c => c.method === 'inc' && c.labels.definition_id === 'test-agent'),
    'should increment resumes counter'
  )
  ok(
    calls.some(c => c.method === 'gauge.dec' && c.labels.status === 'suspended'),
    'should decrement suspended gauge'
  )
  ok(
    calls.some(c => c.method === 'gauge.inc' && c.labels.status === 'started'),
    'should increment started gauge'
  )
})

test('InstanceManager - removeInstance records metrics', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const { metrics, calls } = createMockMetrics()
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, metrics })

  const info = await manager.spawnInstance('test-agent')
  calls.length = 0 // reset

  await manager.removeInstance(info.instanceId)

  ok(
    calls.some(c => c.method === 'inc' && c.labels.definition_id === 'test-agent'),
    'should increment removals counter'
  )
  ok(
    calls.some(c => c.method === 'gauge.dec' && c.labels.status === 'started'),
    'should decrement active gauge'
  )
})

test('InstanceManager - graceful shutdown backs up started instances', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const backedUp: string[] = []
  const mockBackup = {
    backup: async (id: string) => {
      backedUp.push(id)
    },
    restore: async () => false,
    cleanup: async () => {}
  } as unknown as StateBackup
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, stateBackup: mockBackup })

  const info1 = await manager.spawnInstance('test-agent')
  const info2 = await manager.spawnInstance('test-agent')
  await manager.suspendInstance(info2.instanceId)
  backedUp.length = 0 // reset after suspend's own backup

  await manager.backupStartedInstances()

  strictEqual(backedUp.length, 1, 'should only backup started instances')
  strictEqual(backedUp[0], info1.instanceId, 'should backup the started instance')
})

test('InstanceManager - graceful shutdown skips suspended instances', async t => {
  const testRoot = await createTestRoot(t)
  const defs = createMockDefinitions()
  const mgmt = createMockManagement()
  const backedUp: string[] = []
  const mockBackup = {
    backup: async (id: string) => {
      backedUp.push(id)
    },
    restore: async () => false,
    cleanup: async () => {}
  } as unknown as StateBackup
  const manager = createManager(defs, mgmt, testRoot, { idleTimeout: 0, stateBackup: mockBackup })

  const info = await manager.spawnInstance('test-agent')
  await manager.suspendInstance(info.instanceId)
  backedUp.length = 0 // reset after suspend's own backup

  await manager.backupStartedInstances()

  strictEqual(backedUp.length, 0, 'should not backup suspended instances')
})
