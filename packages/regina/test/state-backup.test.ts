import { strictEqual, ok, deepStrictEqual } from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { FsAdapter } from '@platformatic/regina-storage'
import type { BackupFunction, RestoreFunction } from '../src/state-backup.ts'
import { StateBackup } from '../src/state-backup.ts'

const execFileAsync = promisify(execFile)

test('StateBackup', async (t) => {
  let vfsDir: string
  let storageDir: string

  t.beforeEach(async () => {
    vfsDir = await mkdtemp(join(tmpdir(), 'regina-vfs-'))
    storageDir = await mkdtemp(join(tmpdir(), 'regina-storage-'))
  })

  t.afterEach(async () => {
    await rm(vfsDir, { recursive: true, force: true })
    await rm(storageDir, { recursive: true, force: true })
  })

  await t.test('backup stores local SQLite to storage', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })
    const backup = new StateBackup(adapter, { vfsDir })

    const instanceId = 'test-instance-1'
    const data = Buffer.from('sqlite data here')
    await writeFile(join(vfsDir, `${instanceId}.sqlite`), data)

    await backup.backup(instanceId)

    const stored = await adapter.get(instanceId)
    ok(stored)
    deepStrictEqual(stored, data)
  })

  await t.test('restore fetches from storage and writes locally, returns true', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })
    const backup = new StateBackup(adapter, { vfsDir })

    const instanceId = 'test-instance-2'
    const data = Buffer.from('restored sqlite data')
    await adapter.put(instanceId, data)

    const result = await backup.restore(instanceId)
    strictEqual(result, true)

    const restored = await readFile(join(vfsDir, `${instanceId}.sqlite`))
    deepStrictEqual(restored, data)
  })

  await t.test('restore returns false when nothing in storage', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })
    const backup = new StateBackup(adapter, { vfsDir })

    const result = await backup.restore('nonexistent')
    strictEqual(result, false)
  })

  await t.test('cleanup removes from storage', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })
    const backup = new StateBackup(adapter, { vfsDir })

    const instanceId = 'test-instance-3'
    const data = Buffer.from('to be cleaned up')
    await adapter.put(instanceId, data)

    await backup.cleanup(instanceId)

    const result = await adapter.get(instanceId)
    strictEqual(result, null)
  })

  await t.test('integration: backup → delete local → restore → verify roundtrip', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })
    const backup = new StateBackup(adapter, { vfsDir })

    const instanceId = 'test-instance-4'
    const data = Buffer.from('important sqlite database content')
    const localPath = join(vfsDir, `${instanceId}.sqlite`)

    await writeFile(localPath, data)
    await backup.backup(instanceId)

    // Delete local file
    await rm(localPath)

    // Restore from backup
    const result = await backup.restore(instanceId)
    strictEqual(result, true)

    const restored = await readFile(localPath)
    deepStrictEqual(restored, data)
  })

  await t.test('restore creates vfsDir if it does not exist', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })
    const newVfsDir = join(vfsDir, 'nested', 'dir')
    const backup = new StateBackup(adapter, { vfsDir: newVfsDir })

    const instanceId = 'test-instance-5'
    const data = Buffer.from('sqlite in new dir')
    await adapter.put(instanceId, data)

    const result = await backup.restore(instanceId)
    strictEqual(result, true)

    const restored = await readFile(join(newVfsDir, `${instanceId}.sqlite`))
    deepStrictEqual(restored, data)
  })

  await t.test('custom backup/restore with tarball roundtrip', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'regina-tarball-'))
    t.after(() => rm(dataDir, { recursive: true, force: true }))

    const tarBackup: BackupFunction = async (instanceId) => {
      const { stdout } = await execFileAsync('tar', ['-cf', '-', '-C', dataDir, instanceId], {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      })
      return stdout
    }

    const tarRestore: RestoreFunction = async (instanceId, data) => {
      const tarPath = join(dataDir, `${instanceId}.tar`)
      await writeFile(tarPath, data)
      await execFileAsync('tar', ['-xf', tarPath, '-C', dataDir])
      await rm(tarPath)
    }

    const adapter = new FsAdapter({ basePath: storageDir })
    const backup = new StateBackup(adapter, {}, {
      backup: tarBackup,
      restore: tarRestore
    })

    const instanceId = 'test-instance-6'
    const instanceDir = join(dataDir, instanceId)
    await mkdir(instanceDir, { recursive: true })
    await mkdir(join(instanceDir, 'subdir'), { recursive: true })
    await writeFile(join(instanceDir, 'state.json'), '{"key":"value"}')
    await writeFile(join(instanceDir, 'data.bin'), Buffer.from([1, 2, 3, 4]))
    await writeFile(join(instanceDir, 'subdir', 'nested.txt'), 'nested content')

    await backup.backup(instanceId)

    // Delete local folder
    await rm(instanceDir, { recursive: true })

    // Restore from backup
    const result = await backup.restore(instanceId)
    strictEqual(result, true)

    const state = await readFile(join(instanceDir, 'state.json'), 'utf-8')
    strictEqual(state, '{"key":"value"}')

    const bin = await readFile(join(instanceDir, 'data.bin'))
    deepStrictEqual(bin, Buffer.from([1, 2, 3, 4]))

    const nested = await readFile(join(instanceDir, 'subdir', 'nested.txt'), 'utf-8')
    strictEqual(nested, 'nested content')
  })
})
