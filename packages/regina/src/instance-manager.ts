import { getGlobal } from '@platformatic/globals'
import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentDefinition } from './agent-discovery.ts'
import type { MemberRegistry } from './member-registry.ts'
import type { ReginaMetrics } from './metrics.ts'
import type { StateBackup } from './state-backup.ts'

export interface InstanceInfo {
  instanceId: string
  definitionId: string
  status: 'started' | 'stopped' | 'suspended'
  createdAt: Date
}

export type ApplicationPreparer<Definition extends AgentDefinition = AgentDefinition> = (
  this: InstanceManager<Definition>,
  instanceId: string,
  definition: Definition
) => Promise<object>

export interface InstanceManagerOptions<Definition extends AgentDefinition = AgentDefinition> {
  definitions: Map<string, Definition>
  management: any
  root: string
  config: Record<string, any>
  idleTimeout?: number
  coordinatorId?: string
  memberRegistry?: MemberRegistry
  stateBackup?: StateBackup
  metrics?: ReginaMetrics | null
  useProcesses?: boolean
  prepareApplication?: ApplicationPreparer<Definition>
}

export function inferProviderFromModel (model: string): string | undefined {
  if (model.includes('/')) return 'vercel-gateway'
  if (model.startsWith('claude') || model.startsWith('anthropic')) return 'anthropic'
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
    return 'openai'
  }
  return undefined
}

export function resolveProviderEnvKey<Definition extends AgentDefinition> (definition: Definition): string | undefined {
  const provider = definition.provider ?? inferProviderFromModel(definition.model)
  const keys: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    'vercel-gateway': 'AI_GATEWAY_API_KEY'
  }
  return provider ? keys[provider] : undefined
}

export function generateId (prefix: string): string {
  return `${prefix}-${randomBytes(3).toString('hex')}`
}

interface DelegateAgentMetadata {
  id: string
  name: string
  description?: string
  greeting?: string
}

function buildDelegateMetadata<Definition extends AgentDefinition> (
  definition: Definition,
  definitions: Map<string, Definition>
): DelegateAgentMetadata[] | undefined {
  if (!definition.delegates?.length) {
    return undefined
  }

  const delegates = definition.delegates.flatMap((delegateId) => {
    const delegate = definitions.get(delegateId)
    if (!delegate) {
      return []
    }

    return [{
      id: delegate.id,
      name: delegate.name,
      description: delegate.description,
      greeting: delegate.greeting
    }]
  })

  return delegates.length > 0 ? delegates : undefined
}

export class InstanceManager<Definition extends AgentDefinition = AgentDefinition> {
  #instances = new Map<string, InstanceInfo>()
  #timers = new Map<string, ReturnType<typeof setTimeout>>()
  #definitions: Map<string, Definition>
  #management: any
  #root: string
  #config: Record<string, any>
  #idleTimeout: number
  #coordinatorId: string | undefined
  #memberRegistry: MemberRegistry | undefined
  #stateBackup: StateBackup | undefined
  #metrics: ReginaMetrics | null
  #configDir: string
  #useProcesses: boolean
  #prepareApplication: ApplicationPreparer<Definition>

  constructor (options: InstanceManagerOptions<Definition>) {
    this.#definitions = options.definitions
    this.#management = options.management
    this.#root = options.root
    this.#config = options.config
    this.#idleTimeout = options.idleTimeout ?? 0
    this.#coordinatorId = options.coordinatorId
    this.#memberRegistry = options.memberRegistry
    this.#stateBackup = options.stateBackup
    this.#metrics = options.metrics ?? null
    this.#configDir = join(tmpdir(), 'regina-instances')
    this.#useProcesses = options.useProcesses ?? false
    this.#prepareApplication = (options.prepareApplication ?? this.defaultPrepareApplication).bind(this)
  }

  get root (): string {
    return this.#root
  }

  get config (): Record<string, any> {
    return this.#config
  }

  get definitions (): Map<string, Definition> {
    return this.#definitions
  }

  get coordinatorId (): string | undefined {
    return this.#coordinatorId
  }

  get configDir (): string {
    return this.#configDir
  }

  async spawnInstance (definitionId: string, existingInstanceId?: string): Promise<InstanceInfo> {
    const definition = this.#definitions.get(definitionId)
    if (!definition) {
      throw new Error(`Agent definition not found: ${definitionId}`)
    }

    const instanceId = existingInstanceId ?? generateId(definitionId)
    this.#metrics?.instanceSpawnsTotal.inc({ definition_id: definitionId })
    const stopTimer = this.#metrics?.instanceSpawnDuration.startTimer({ definition_id: definitionId })

    const applicationArguments = await this.#prepareApplication(instanceId, definition)

    await this.#management.addApplications([applicationArguments], true)

    if (this.#memberRegistry) {
      await this.#memberRegistry.registerInstance(instanceId)
    }

    const info: InstanceInfo = {
      instanceId,
      definitionId,
      status: 'started',
      createdAt: new Date()
    }
    this.#instances.set(instanceId, info)
    this.#startTimer(instanceId)
    stopTimer?.()
    this.#metrics?.instancesActive.inc({ definition_id: definitionId, status: 'started' })
    return info
  }

  async suspendInstance (instanceId: string): Promise<void> {
    const instance = this.#instances.get(instanceId)
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`)
    }
    if (instance.status === 'suspended') return

    if (this.#stateBackup) {
      await this.#stateBackup.backup(instanceId)
    }
    await this.#management.stopApplication(instanceId)
    instance.status = 'suspended'
    this.#clearTimer(instanceId)
    this.#metrics?.instanceSuspensionsTotal.inc({ definition_id: instance.definitionId })
    this.#metrics?.instancesActive.dec({ definition_id: instance.definitionId, status: 'started' })
    this.#metrics?.instancesActive.inc({ definition_id: instance.definitionId, status: 'suspended' })
  }

  async resumeInstance (instanceId: string): Promise<void> {
    const instance = this.#instances.get(instanceId)
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`)
    }

    if (this.#stateBackup) {
      await this.#stateBackup.restore(instanceId)
    }
    await this.#management.startApplication(instanceId)
    instance.status = 'started'
    this.#startTimer(instanceId)
    this.#metrics?.instanceResumesTotal.inc({ definition_id: instance.definitionId })
    this.#metrics?.instancesActive.dec({ definition_id: instance.definitionId, status: 'suspended' })
    this.#metrics?.instancesActive.inc({ definition_id: instance.definitionId, status: 'started' })
  }

  refreshTimer (instanceId: string): void {
    if (!this.#timers.has(instanceId)) return
    this.#clearTimer(instanceId)
    this.#startTimer(instanceId)
  }

  clearAllTimers (): void {
    for (const timer of this.#timers.values()) {
      clearTimeout(timer)
    }
    this.#timers.clear()
  }

  async restoreInstance (instanceId: string): Promise<InstanceInfo | null> {
    // Already running locally
    const existing = this.#instances.get(instanceId)
    if (existing) return existing

    // No storage backup configured
    if (!this.#stateBackup) return null

    // Try to restore from shared storage
    const restored = await this.#stateBackup.restore(instanceId)
    if (!restored) return null

    // Extract definitionId from instanceId (format: defId-hex)
    const definitionId = instanceId.replace(/-[a-f0-9]{6}$/, '')
    return this.spawnInstance(definitionId, instanceId)
  }

  async findOrSpawnInstance (definitionId: string): Promise<InstanceInfo> {
    const instances = this.listInstances(definitionId)

    // Prefer a started instance
    const started = instances.find(i => i.status === 'started')
    if (started) return started

    // Resume a suspended instance
    const suspended = instances.find(i => i.status === 'suspended')
    if (suspended) {
      await this.resumeInstance(suspended.instanceId)
      return suspended
    }

    // Spawn new
    return this.spawnInstance(definitionId)
  }

  async removeInstance (instanceId: string): Promise<void> {
    const instance = this.#instances.get(instanceId)
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`)
    }

    this.#clearTimer(instanceId)
    await this.#management.removeApplications([instanceId])
    this.#metrics?.instanceRemovalsTotal.inc({ definition_id: instance.definitionId })
    this.#metrics?.instancesActive.dec({ definition_id: instance.definitionId, status: instance.status })
    this.#instances.delete(instanceId)

    if (this.#memberRegistry) {
      await this.#memberRegistry.deregisterInstance(instanceId)
    }
    if (this.#stateBackup) {
      await this.#stateBackup.cleanup(instanceId)
    }

    await this.removeInstanceConfig(instanceId)
  }

  listInstances (definitionId?: string): InstanceInfo[] {
    const instances = [...this.#instances.values()]
    if (definitionId) {
      return instances.filter(i => i.definitionId === definitionId)
    }
    return instances
  }

  getInstance (instanceId: string): InstanceInfo | undefined {
    return this.#instances.get(instanceId)
  }

  async backupStartedInstances (): Promise<void> {
    if (!this.#stateBackup) return

    const startedInstances = this.listInstances().filter(i => i.status === 'started')
    const promises = startedInstances.map(i => this.#stateBackup!.backup(i.instanceId))
    const results = await Promise.allSettled(promises)

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'rejected') {
        const instanceId = startedInstances[i].instanceId
        console.error(`Failed to backup instance ${instanceId}:`, result.reason)
      }
    }
  }

  getConfigPath (instanceId: string): string {
    return join(this.#configDir, `${instanceId}.json`)
  }

  getApplicationPath (): string {
    const root = getGlobal()?.root
    return root ? fileURLToPath(root) : resolve(dirname(new URL(import.meta.url).pathname), '../../regina-agent')
  }

  #startTimer (instanceId: string): void {
    if (this.#idleTimeout <= 0) return
    const timer = setTimeout(() => {
      this.suspendInstance(instanceId)
    }, this.#idleTimeout)
    timer.unref()
    this.#timers.set(instanceId, timer)
  }

  #clearTimer (instanceId: string): void {
    const timer = this.#timers.get(instanceId)
    if (timer) {
      clearTimeout(timer)
      this.#timers.delete(instanceId)
    }
  }

  buildInstanceConfig (
    definition: Definition,
    vfsDbPath: string | undefined,
    coordinatorId?: string,
    instanceId?: string,
    apiKey?: string
  ) {
    const delegateAgents = buildDelegateMetadata(definition, this.#definitions)

    return {
      module: '@platformatic/regina-agent',
      reginaAgent: {
        useProcesses: this.#useProcesses,
        definitionPath: definition.filePath,
        toolsBasePath: dirname(definition.filePath),
        vfsDbPath,
        ...(coordinatorId ? { coordinatorId, instanceId } : {}),
        ...(apiKey ? { apiKey } : {}),
        ...(delegateAgents ? { delegateAgents } : {})
      }
    }
  }

  async writeInstanceConfig (instanceId: string, config: object): Promise<string> {
    await mkdir(this.#configDir, { recursive: true })
    const configPath = this.getConfigPath(instanceId)
    await writeFile(configPath, JSON.stringify(config, null, 2))
    return configPath
  }

  async removeInstanceConfig (instanceId: string): Promise<void> {
    try {
      await unlink(this.getConfigPath(instanceId))
    } catch {}
  }

  async defaultPrepareApplication (instanceId: string, definition: Definition): Promise<object> {
    const vfsDir = resolve(this.#root, this.#config.vfsDir ?? './vfs')
    await mkdir(vfsDir, { recursive: true })
    const vfsDbPath = resolve(vfsDir, `${instanceId}.sqlite`)

    const envKey = resolveProviderEnvKey(definition)
    const apiKey = envKey ? process.env[envKey] : undefined

    return {
      id: instanceId,
      path: this.getApplicationPath(),
      config: await this.writeInstanceConfig(
        instanceId,
        this.buildInstanceConfig(definition, vfsDbPath, this.#coordinatorId, instanceId, apiKey)
      ),
      env: {} as Record<string, string>
    }
  }
}
