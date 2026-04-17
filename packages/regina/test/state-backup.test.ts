import { strictEqual, ok, deepStrictEqual } from 'node:assert'
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FsAdapter } from '@platformatic/regina-storage'
import type { BackupFunction, RestoreFunction } from '../src/state-backup.ts'
import { StateBackup } from '../src/state-backup.ts'

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

  await t.test('restore skips fetch if local file already exists', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })
    const backup = new StateBackup(adapter, { vfsDir })

    const instanceId = 'test-instance-local'
    const localData = Buffer.from('local sqlite')
    const storageData = Buffer.from('storage sqlite')

    await writeFile(join(vfsDir, `${instanceId}.sqlite`), localData)
    await adapter.put(instanceId, storageData)

    const result = await backup.restore(instanceId)
    strictEqual(result, true)

    // Local file should NOT be overwritten
    const content = await readFile(join(vfsDir, `${instanceId}.sqlite`))
    deepStrictEqual(content, localData)
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

  await t.test('custom backup/restore functions receive storage adapter', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })

    const customBackup: BackupFunction = async (storage, instanceId, config) => {
      const data = Buffer.from(`custom-${instanceId}`)
      await storage.put(instanceId, data)
    }

    const customRestore: RestoreFunction = async (storage, instanceId, config) => {
      const data = await storage.get(instanceId)
      if (!data) return false
      await mkdir(config.dataDir, { recursive: true })
      await writeFile(join(config.dataDir, `${instanceId}.dat`), data)
      return true
    }

    const dataDir = await mkdtemp(join(tmpdir(), 'regina-custom-'))
    t.after(() => rm(dataDir, { recursive: true, force: true }))

    const backup = new StateBackup(adapter, { dataDir }, {
      backup: customBackup,
      restore: customRestore
    })

    const instanceId = 'test-instance-6'
    await backup.backup(instanceId)

    const stored = await adapter.get(instanceId)
    ok(stored)
    deepStrictEqual(stored, Buffer.from(`custom-${instanceId}`))

    const result = await backup.restore(instanceId)
    strictEqual(result, true)

    const restored = await readFile(join(dataDir, `${instanceId}.dat`))
    deepStrictEqual(restored, Buffer.from(`custom-${instanceId}`))
  })

  await t.test('custom restore returns false when no data in storage', async () => {
    const adapter = new FsAdapter({ basePath: storageDir })

    const customRestore: RestoreFunction = async (storage, instanceId) => {
      const data = await storage.get(instanceId)
      if (!data) return false
      return true
    }

    const backup = new StateBackup(adapter, {}, { restore: customRestore })

    const result = await backup.restore('nonexistent')
    strictEqual(result, false)
  })
})
