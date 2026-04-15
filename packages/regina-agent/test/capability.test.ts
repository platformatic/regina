import {
  create,
  type Runtime as PlatformaticRuntime,
  type RuntimeConfiguration,
  transform as runtimeTransform
} from '@platformatic/runtime'
import { execFile as execFileCb } from 'node:child_process'
import { deepStrictEqual, ok } from 'node:assert'
import { promisify } from 'node:util'
import { access, cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test, { type TestContext } from 'node:test'
import { request } from 'undici'

interface Runtime extends PlatformaticRuntime {
  init (): Promise<void>
  start (): Promise<string>
  close (): Promise<void>
}

const execFile = promisify(execFileCb)
const repoRoot = resolve(import.meta.dirname, '../../..')
let buildOnce: Promise<void> | undefined

async function ensureWorkspaceBuild () {
  try {
    await access(resolve(repoRoot, 'packages/regina/dist/index.js'))
    await access(resolve(repoRoot, 'packages/regina-agent/dist/index.js'))
    await access(resolve(repoRoot, 'packages/regina-storage/dist/index.js'))
    return
  } catch {}

  buildOnce ??= execFile(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build'], {
    cwd: repoRoot
  }).then(() => {})

  await buildOnce
}

async function getAllLogs (rootDir: string) {
  const rawLogs = await readFile(resolve(rootDir, 'logs.txt'), 'utf-8')
  return rawLogs
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line))
}

async function ensureSymlink (target: string, path: string) {
  try {
    const stats = await lstat(path)
    if (stats.isSymbolicLink()) {
      return
    }
    throw new Error(`Expected ${path} to be a symlink`)
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err
    }
  }

  await symlink(target, path, 'dir')
}

async function prepareRuntime (
  t: TestContext,
  fixtureDir: string,
  additionalSetup?: (rootDir: string) => Promise<void>
): Promise<{ rootDir: string; runtime: Runtime }> {
  await ensureWorkspaceBuild()

  // Create the runtime
  await mkdir(resolve(import.meta.dirname, '../../../tmp'), { recursive: true })
  const rootDir = await mkdtemp(resolve(resolve(import.meta.dirname, '../../../tmp'), 'tmp-regina-agent-runtime-'))
  await cp(fixtureDir, rootDir, { recursive: true })

  // Ensure dependencies
  await mkdir(resolve(rootDir, 'node_modules/@platformatic'), { recursive: true })
  await mkdir(resolve(rootDir, 'regina/node_modules/@platformatic'), { recursive: true })

  const reginaAgentPath = resolve(import.meta.dirname, '../')
  const reginaPath = resolve(import.meta.dirname, '../../regina')
  const repoNodeModules = resolve(import.meta.dirname, '../../../node_modules/@platformatic')

  await ensureSymlink(reginaAgentPath, resolve(rootDir, 'node_modules/@platformatic/regina-agent'))
  await ensureSymlink(reginaPath, resolve(rootDir, 'node_modules/@platformatic/regina'))
  await ensureSymlink(reginaAgentPath, resolve(rootDir, 'regina/node_modules/@platformatic/regina-agent'))
  await ensureSymlink(reginaPath, resolve(rootDir, 'regina/node_modules/@platformatic/regina'))
  await ensureSymlink(reginaAgentPath, resolve(repoNodeModules, 'regina-agent'))
  await ensureSymlink(reginaPath, resolve(repoNodeModules, 'regina'))

  if (additionalSetup) {
    await additionalSetup(rootDir)
  }

  // Create the runtime
  const runtime = (await create(rootDir, undefined, {
    setupSignals: false,
    async transform (config, ...args: any[]) {
      config = await runtimeTransform(config as unknown as RuntimeConfiguration, ...args)
      // @ts-expect-error
      config.logger.transport ??= {
        target: 'pino/file',
        options: { destination: resolve(rootDir, 'logs.txt') }
      }

      return config
    }
  })) as Runtime

  // Cleanup
  const originalCwd = process.cwd()
  const originalEnv = process.env.PLT_PRETTY_PRINT
  t.after(async () => {
    process.chdir(originalCwd)
    process.env.PLT_PRETTY_PRINT = originalEnv

    await runtime.close()
    await rm(rootDir, { recursive: true, force: true })
  })

  // Start a new instance
  process.env.PLT_PRETTY_PRINT = 'false'
  process.chdir(rootDir)

  return { rootDir, runtime }
}

test('runtime - useProcesses=false starts regina-agent in-process and replies to chat', async t => {
  const { rootDir, runtime } = await prepareRuntime(t, resolve(import.meta.dirname, 'fixtures/base'))

  await runtime.init()
  const url = await runtime.start()
  let instanceId: string

  {
    const res = await request(new URL('/agents/weather-agent/instances', url!), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' })
    })

    deepStrictEqual(res.statusCode, 201)
    const body = (await res.body.json()) as { status: string; instanceId: string }
    deepStrictEqual(body.status, 'started')
    instanceId = body.instanceId
  }

  {
    const res = await request(new URL(`/instances/${instanceId}/messages`, url!), { method: 'GET' })

    deepStrictEqual(res.statusCode, 200)
    deepStrictEqual(await res.body.json(), [])
  }

  const logs = await getAllLogs(rootDir)

  // Parse all logs, we should only see the current pid
  const pids = new Set(logs.map(log => log.pid))
  deepStrictEqual(pids.size, 1)
  deepStrictEqual(pids.has(process.pid), true)
})

test('runtime - useProcesses=true starts regina-agent in-process and replies to chat', async t => {
  const { rootDir, runtime } = await prepareRuntime(t, resolve(import.meta.dirname, 'fixtures/base'), async (
    rootDir: string
  ) => {
    const configPath = resolve(rootDir, 'regina/watt.json')
    const config = JSON.parse(await readFile(configPath, 'utf-8'))
    config.regina.useProcesses = true
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  })

  await runtime.init()
  const url = await runtime.start()
  let instanceId: string

  {
    const res = await request(new URL('/agents/weather-agent/instances', url!), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' })
    })

    deepStrictEqual(res.statusCode, 201)
    const body = (await res.body.json()) as { status: string; instanceId: string }
    deepStrictEqual(body.status, 'started')
    instanceId = body.instanceId
  }

  {
    const res = await request(new URL(`/instances/${instanceId}/messages`, url!), { method: 'GET' })

    deepStrictEqual(res.statusCode, 200)
    deepStrictEqual(await res.body.json(), [])
  }

  const logs = await getAllLogs(rootDir)

  // Parse all logs, we should see exactly two pids: the current one and the one of the child process running the agent
  const pids = new Set(logs.map(log => log.pid))
  deepStrictEqual(pids.size, 2)
  deepStrictEqual(pids.has(process.pid), true)

  // Now find all logs from the other pid to make sure they are from the agent
  const agentLogs = logs.filter(log => log.pid !== process.pid)
  ok(agentLogs.every(log => log.name.startsWith('weather-agent-')))
  ok(agentLogs.some(log => log.msg.startsWith(`Agent ${instanceId} is listening on http://127.0.0.1`)))
})
