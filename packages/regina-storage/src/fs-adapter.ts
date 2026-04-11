import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StorageAdapter } from './adapter.ts'

const SUFFIX = '.sqlite'

export class FsAdapter implements StorageAdapter {
  #basePath: string
  #dirCreated: boolean = false

  constructor ({ basePath }: { basePath: string }) {
    this.#basePath = basePath
  }

  async #ensureDir (): Promise<void> {
    if (!this.#dirCreated) {
      await mkdir(this.#basePath, { recursive: true })
      this.#dirCreated = true
    }
  }

  async put (key: string, data: Buffer): Promise<void> {
    await this.#ensureDir()
    await writeFile(join(this.#basePath, key + SUFFIX), data)
  }

  async get (key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.#basePath, key + SUFFIX))
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw err
    }
  }

  async delete (key: string): Promise<void> {
    try {
      await unlink(join(this.#basePath, key + SUFFIX))
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw err
    }
  }

  async list (prefix: string): Promise<string[]> {
    let entries: string[]
    try {
      entries = await readdir(this.#basePath)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }

    const results: string[] = []
    for (const entry of entries) {
      if (entry.endsWith(SUFFIX)) {
        const name = entry.slice(0, -SUFFIX.length)
        if (name.startsWith(prefix)) {
          results.push(name)
        }
      }
    }
    return results
  }

  async close (): Promise<void> {
    // noop
  }
}
