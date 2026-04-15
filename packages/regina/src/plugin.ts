import { ensureLoggableError, kMetadata } from '@platformatic/foundation'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { discoverAgents } from './agent-discovery.ts'
import type { ApplicationPreparer, InstanceManagerOptions } from './instance-manager.ts'
import { InstanceManager } from './instance-manager.ts'
import { MemberRegistry } from './member-registry.ts'
import { createMetrics } from './metrics.ts'
import { agentRoutes } from './routes/agents.ts'
import { chatRoutes } from './routes/chat.ts'
import { delegateRoutes } from './routes/delegate.ts'
import { instanceRoutes } from './routes/instances.ts'
import { StateBackup } from './state-backup.ts'
import type { BackupFunction, RestoreFunction } from './state-backup.ts'

type Factory = {
  prepareApplication?: ApplicationPreparer
  backup?: BackupFunction
  restore?: RestoreFunction
}

async function loadFactory (app: FastifyInstance, root: any, config: any): Promise<Factory | undefined> {
  let loaded: Record<string, unknown> | undefined

  if (config.factory.startsWith('npm:')) {
    const require = createRequire(resolve(root, 'index.js'))
    const packageName = config.factory.slice(4)

    try {
      loaded = require(packageName)
    } catch (err) {
      app.log.error({ err: ensureLoggableError(err as Error) }, `Failed to load npm factory module ${packageName}.`)
    }
  } else {
    const factoryPath = resolve(root, config.factory)

    try {
      loaded = await import(factoryPath)
    } catch (err) {
      app.log.error({ err: ensureLoggableError(err as Error) }, `Failed to load factory module ${factoryPath}.`)
    }
  }

  if (!loaded) return undefined

  const factory: Factory = {}
  if (typeof loaded.prepareApplication === 'function') {
    factory.prepareApplication = loaded.prepareApplication as ApplicationPreparer
  }
  if (typeof loaded.backup === 'function') {
    factory.backup = loaded.backup as BackupFunction
  }
  if (typeof loaded.restore === 'function') {
    factory.restore = loaded.restore as RestoreFunction
  }

  return factory
}

async function reginaPlugin (app: FastifyInstance, _options: Record<string, unknown>) {
  const config = (app as any).platformatic.config.regina ?? {}
  const root = (app as any).platformatic.config[kMetadata].root
  const agentsDir = resolve(root, config.agentsDir ?? './agents')

  const definitions = await discoverAgents(agentsDir)
  app.log.info({ count: definitions.size, dir: agentsDir }, 'Discovered agent definitions')

  app.decorate('agentDefinitions', definitions)

  const management = (globalThis as any).platformatic?.management
  const coordinatorId: string | undefined = (globalThis as any).platformatic?.applicationId
  const idleTimeout = (config.idleTimeout ?? 300) * 1000

  // Conditional Redis + MemberRegistry
  let redis: import('iovalkey').Redis | undefined
  let memberRegistry: MemberRegistry | undefined
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined

  if (config.redis) {
    const { Redis } = await import('iovalkey')
    redis = new Redis(config.redis)
    const memberAddress = config.memberAddress ?? ''
    const memberId = config.memberId ?? coordinatorId ?? ''
    memberRegistry = new MemberRegistry(redis, memberAddress, memberId)
    await memberRegistry.register()
    heartbeatInterval = setInterval(() => {
      memberRegistry!.heartbeat()
    }, 10_000)
    heartbeatInterval.unref()
    app.log.info({ memberId }, 'Registered in member registry')
  }

  let factory: Factory | undefined
  if (config.factory) {
    factory = await loadFactory(app, root, config)
  }

  // Conditional Storage + StateBackup
  let storageAdapter: import('@platformatic/regina-storage').StorageAdapter | undefined
  let stateBackup: StateBackup | undefined

  if (config.storage) {
    const storageConfig = config.storage
    if (storageConfig.type === 'fs') {
      const { FsAdapter } = await import('@platformatic/regina-storage')
      storageAdapter = new FsAdapter({ basePath: storageConfig.basePath ?? resolve(root, './state-backup') })
    } else if (storageConfig.type === 's3') {
      const { S3Adapter } = await import('@platformatic/regina-storage')
      storageAdapter = new S3Adapter({
        bucket: storageConfig.bucket,
        prefix: storageConfig.prefix,
        endpoint: storageConfig.endpoint,
        region: storageConfig.region
      })
    } else if (storageConfig.type === 'redis') {
      if (!redis) {
        const { Redis } = await import('iovalkey')
        redis = new Redis(config.redis)
      }
      const { RedisAdapter } = await import('@platformatic/regina-storage')
      storageAdapter = new RedisAdapter({ client: redis })
    }

    if (storageAdapter) {
      stateBackup = new StateBackup(storageAdapter, config, {
        backup: factory?.backup,
        restore: factory?.restore
      })
      app.log.info({ type: storageConfig.type }, 'State backup enabled')
    }
  }

  const metrics = createMetrics()
  const instanceManagerOptions: InstanceManagerOptions = {
    definitions,
    management,
    root,
    config,
    idleTimeout,
    coordinatorId,
    memberRegistry,
    stateBackup,
    metrics,
    useProcesses: config.useProcesses ?? false
  }

  if (factory) {
    instanceManagerOptions.prepareApplication = factory.prepareApplication
  }

  const instanceManager = new InstanceManager(instanceManagerOptions)
  app.decorate('instanceManager', instanceManager)

  app.addHook('onClose', async () => {
    instanceManager.clearAllTimers()
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
    }
    await instanceManager.backupStartedInstances()
    if (memberRegistry) {
      await memberRegistry.deregister()
    }
    if (storageAdapter) {
      await storageAdapter.close()
    }
    if (redis) {
      await redis.quit()
    }
  })

  await app.register(agentRoutes)
  await app.register(instanceRoutes)
  await app.register(chatRoutes)
  await app.register(delegateRoutes)
}

export const plugin = fp(reginaPlugin, { name: 'regina' })
