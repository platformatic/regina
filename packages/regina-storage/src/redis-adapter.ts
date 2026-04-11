import type { Redis } from 'iovalkey'
import type { StorageAdapter } from './adapter.ts'

export class RedisAdapter implements StorageAdapter {
  #client: Redis
  #hashKey: string

  constructor ({ client, hashKey }: { client: Redis, hashKey?: string }) {
    this.#client = client
    this.#hashKey = hashKey ?? 'regina:state'
  }

  async put (key: string, data: Buffer): Promise<void> {
    await this.#client.hset(this.#hashKey, key, data)
  }

  async get (key: string): Promise<Buffer | null> {
    const result = await this.#client.hgetBuffer(this.#hashKey, key)
    return result ?? null
  }

  async delete (key: string): Promise<void> {
    await this.#client.hdel(this.#hashKey, key)
  }

  async list (prefix: string): Promise<string[]> {
    const keys = await this.#client.hkeys(this.#hashKey)
    return keys.filter(k => k.startsWith(prefix))
  }

  async close (): Promise<void> {
    // noop — caller owns the Redis client
  }
}
