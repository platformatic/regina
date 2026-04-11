import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { StorageAdapter } from '@platformatic/regina-storage'

export class StateBackup {
  #storage: StorageAdapter
  #vfsDir: string

  constructor (storage: StorageAdapter, vfsDir: string) {
    this.#storage = storage
    this.#vfsDir = vfsDir
  }

  async backup (instanceId: string): Promise<void> {
    const filePath = resolve(this.#vfsDir, `${instanceId}.sqlite`)
    const data = await readFile(filePath)
    await this.#storage.put(instanceId, data)
  }

  async restore (instanceId: string): Promise<boolean> {
    const data = await this.#storage.get(instanceId)
    if (!data) return false
    await mkdir(this.#vfsDir, { recursive: true })
    const filePath = resolve(this.#vfsDir, `${instanceId}.sqlite`)
    await writeFile(filePath, data)
    return true
  }

  async cleanup (instanceId: string): Promise<void> {
    await this.#storage.delete(instanceId)
  }
}
