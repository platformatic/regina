import { resolve } from 'node:path'
import type { VirtualFileSystem } from '@platformatic/vfs'

interface FsStat {
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
  mode: number
  size: number
  mtime: Date
}

interface DirentEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

function toFsStat (stats: any): FsStat {
  return {
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymbolicLink: stats.isSymbolicLink(),
    mode: stats.mode,
    size: stats.size,
    mtime: stats.mtime
  }
}

export class VfsAdapter {
  #vfs: VirtualFileSystem

  constructor (vfs: VirtualFileSystem) {
    this.#vfs = vfs
  }

  async readFile (path: string, options?: any): Promise<string> {
    const result = await this.#vfs.promises.readFile(path, options ?? 'utf-8')
    return result.toString()
  }

  async readFileBuffer (path: string): Promise<Uint8Array> {
    const buf = await this.#vfs.promises.readFile(path)
    return new Uint8Array(buf)
  }

  async writeFile (path: string, content: string | Uint8Array, options?: any): Promise<void> {
    await this.#vfs.promises.writeFile(path, content as string | Buffer, options)
  }

  async appendFile (path: string, content: string | Uint8Array, options?: any): Promise<void> {
    await this.#vfs.promises.appendFile(path, content as string | Buffer, options)
  }

  async exists (path: string): Promise<boolean> {
    return this.#vfs.existsSync(path)
  }

  async stat (path: string): Promise<FsStat> {
    const stats = await this.#vfs.promises.stat(path)
    return toFsStat(stats)
  }

  async mkdir (path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.#vfs.promises.mkdir(path, options)
  }

  async readdir (path: string): Promise<string[]> {
    return this.#vfs.promises.readdir(path)
  }

  async readdirWithFileTypes (path: string): Promise<DirentEntry[]> {
    const entries = await this.#vfs.promises.readdir(path, { withFileTypes: true })
    return entries.map((e: any) => ({
      name: e.name,
      isFile: e.isFile(),
      isDirectory: e.isDirectory(),
      isSymbolicLink: e.isSymbolicLink()
    }))
  }

  async rm (path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    let stats: any
    try {
      stats = await this.#vfs.promises.stat(path)
    } catch {
      if (options?.force) return
      throw new Error(`ENOENT: no such file or directory, rm '${path}'`)
    }

    if (stats.isDirectory()) {
      if (options?.recursive) {
        await this.#rmRecursive(path)
      } else {
        await this.#vfs.promises.rmdir(path)
      }
    } else {
      await this.#vfs.promises.unlink(path)
    }
  }

  async #rmRecursive (dirPath: string): Promise<void> {
    const entries = await this.#vfs.promises.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry.name)
      if (entry.isDirectory()) {
        await this.#rmRecursive(fullPath)
      } else {
        await this.#vfs.promises.unlink(fullPath)
      }
    }
    await this.#vfs.promises.rmdir(dirPath)
  }

  async cp (src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    const stats = await this.#vfs.promises.stat(src)
    if (stats.isDirectory()) {
      if (!options?.recursive) {
        throw new Error('cp: -r not specified; omitting directory')
      }
      await this.#cpRecursive(src, dest)
    } else {
      await this.#vfs.promises.copyFile(src, dest)
    }
  }

  async #cpRecursive (src: string, dest: string): Promise<void> {
    await this.#vfs.promises.mkdir(dest, { recursive: true })
    const entries = await this.#vfs.promises.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = resolve(src, entry.name)
      const destPath = resolve(dest, entry.name)
      if (entry.isDirectory()) {
        await this.#cpRecursive(srcPath, destPath)
      } else {
        await this.#vfs.promises.copyFile(srcPath, destPath)
      }
    }
  }

  async mv (src: string, dest: string): Promise<void> {
    await this.#vfs.promises.rename(src, dest)
  }

  resolvePath (base: string, path: string): string {
    return resolve(base, path)
  }

  getAllPaths (): string[] {
    return this.#walkSync('/')
  }

  #walkSync (dir: string): string[] {
    const paths: string[] = []
    let entries: string[]
    try {
      entries = this.#vfs.readdirSync(dir)
    } catch {
      return paths
    }
    for (const name of entries) {
      const full = resolve(dir, name)
      paths.push(full)
      try {
        const stats = this.#vfs.statSync(full)
        if (stats.isDirectory()) {
          paths.push(...this.#walkSync(full))
        }
      } catch {
        // skip inaccessible entries
      }
    }
    return paths
  }

  async chmod (_path: string, _mode: number): Promise<void> {
    // VFS doesn't expose chmod — no-op
  }

  async symlink (target: string, linkPath: string): Promise<void> {
    await this.#vfs.promises.symlink(target, linkPath)
  }

  async link (_existingPath: string, _newPath: string): Promise<void> {
    throw new Error('hard links not supported by VFS')
  }

  async readlink (path: string): Promise<string> {
    return this.#vfs.promises.readlink(path)
  }

  async lstat (path: string): Promise<FsStat> {
    const stats = await this.#vfs.promises.lstat(path)
    return toFsStat(stats)
  }

  async realpath (path: string): Promise<string> {
    return this.#vfs.promises.realpath(path)
  }

  async utimes (_path: string, _atime: Date, _mtime: Date): Promise<void> {
    // VFS manages mtimes internally — no-op
  }
}
