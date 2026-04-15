import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { StorageAdapter } from '@platformatic/regina-storage'

export type BackupFunction = (instanceId: string, config: Record<string, any>) => Promise<Buffer>
export type RestoreFunction = (instanceId: string, data: Buffer, config: Record<string, any>) => Promise<void>

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
    const data = await this.#backup(instanceId, this.#config)
    await this.#storage.put(instanceId, data)
  }

  async restore (instanceId: string): Promise<boolean> {
    const data = await this.#storage.get(instanceId)
    if (!data) return false

    await this.#restore(instanceId, data, this.#config)
    return true
  }

  async cleanup (instanceId: string): Promise<void> {
    await this.#storage.delete(instanceId)
  }
}

export async function defaultBackup (instanceId: string, config: Record<string, any>): Promise<Buffer> {
  const filePath = resolve(config.vfsDir, `${instanceId}.sqlite`)
  return readFile(filePath)
}

export async function defaultRestore (instanceId: string, data: Buffer, config: Record<string, any>): Promise<void> {
  await mkdir(config.vfsDir, { recursive: true })
  const filePath = resolve(config.vfsDir, `${instanceId}.sqlite`)
  await writeFile(filePath, data)
}

