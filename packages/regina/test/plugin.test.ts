import { kMetadata } from '@platformatic/foundation'
import Fastify from 'fastify'
import { strictEqual } from 'node:assert'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { plugin } from '../src/plugin.ts'

function createManagementMock () {
  const added: Array<{ apps: object[]; start: boolean }> = []

  return {
    added,
    async addApplications (apps: object[], start: boolean) {
      added.push({ apps, start })
    },
    async removeApplications () {},
    async stopApplication () {},
    async startApplication () {}
  }
}

test('plugin - uses prepareApplication from configured factory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'regina-plugin-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  await mkdir(join(root, 'agents'), { recursive: true })
  await writeFile(
    join(root, 'agents', 'test-agent.md'),
    `---
name: test-agent
model: gpt-4o
---

You are a test agent.`
  )

  await writeFile(
    join(root, 'factory.mjs'),
    `export async function prepareApplication (instanceId, definition) {
  return {
    id: instanceId,
    path: '/tmp/custom-app',
    config: definition.id + ':' + instanceId,
    env: { FACTORY: '1' }
  }
}
`
  )

  const management = createManagementMock()
  const previousGlobalPlatformatic = (globalThis as any).platformatic
  // @ts-expect-error
  globalThis.platformatic = { management, applicationId: 'coordinator-1' }
  t.after(() => {
    // @ts-expect-error
    globalThis.platformatic = previousGlobalPlatformatic
  })

  const app = Fastify({ logger: false })
  t.after(() => app.close())
  ;(app as any).platformatic = {
    config: {
      regina: {
        agentsDir: './agents',
        factory: './factory.mjs'
      },
      [kMetadata]: {
        root
      }
    }
  }

  await app.register(plugin)

  const instance = await (app as any).instanceManager.spawnInstance('test-agent')
  strictEqual(management.added.length, 1)
  strictEqual(management.added[0].start, true)

  const addedApplication = management.added[0].apps[0] as any
  strictEqual(addedApplication.path, '/tmp/custom-app')
  strictEqual(addedApplication.config, `test-agent:${instance.instanceId}`)
  strictEqual(addedApplication.env.FACTORY, '1')
})
