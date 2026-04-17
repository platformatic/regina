import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { StorageAdapter } from '@platformatic/regina-storage'

export type BackupFunction = (storage: StorageAdapter, instanceId: string, config: Record<string, any>) => Promise<void>
export type RestoreFunction = (storage: StorageAdapter, instanceId: string, config: Record<string, any>) => Promise<boolean>

export class StateBackup {
  #storage: StorageAdapter
  #config: Record<string, any>
  #backup: BackupFunction
  #restore: RestoreFunction

  constructor (storage: StorageAdapter, config: Record<string, any>, options?: {
    backup?: BackupFunction
    restore?: RestoreFunction
  }) {
    this.#storage = storage
    this.#config = config
    this.#backup = options?.backup ?? defaultBackup
    this.#restore = options?.restore ?? defaultRestore
  }

  async backup (instanceId: string): Promise<void> {
    await this.#backup(this.#storage, instanceId, this.#config)
  }

  async restore (instanceId: string): Promise<boolean> {
    return this.#restore(this.#storage, instanceId, this.#config)
  }

  async cleanup (instanceId: string): Promise<void> {
    await this.#storage.delete(instanceId)
  }
}

export async function defaultBackup (
  storage: StorageAdapter,
  instanceId: string,
  config: Record<string, any>
): Promise<void> {
  const filePath = resolve(config.vfsDir, `${instanceId}.sqlite`)
  const data = await readFile(filePath)
  await storage.put(instanceId, data)
}

export async function defaultRestore (
  storage: StorageAdapter,
  instanceId: string,
  config: Record<string, any>
): Promise<boolean> {
  const filePath = resolve(config.vfsDir, `${instanceId}.sqlite`)
  if (existsSync(filePath)) return true

  const data = await storage.get(instanceId)
  if (!data) return false

  await mkdir(config.vfsDir, { recursive: true })
  await writeFile(filePath, data)
  return true
}
