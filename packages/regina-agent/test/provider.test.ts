import { ok } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { MemoryProvider, RealFSProvider, SqliteProvider } from '@platformatic/vfs'
import { createProvider } from '../src/vfs-provider.ts'

test('createProvider - returns MemoryProvider by default', () => {
  const provider = createProvider({ definitionPath: '/test' })
  ok(provider instanceof MemoryProvider)
})

test('createProvider - returns SqliteProvider when vfsDbPath is set', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'regina-provider-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const provider = createProvider({ definitionPath: '/test', vfsDbPath: join(dir, 'test.sqlite') })
  ok(provider instanceof SqliteProvider)
})

test('createProvider - returns RealFSProvider when fsRootPath is set', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'regina-provider-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const provider = createProvider({ definitionPath: '/test', fsRootPath: dir })
  ok(provider instanceof RealFSProvider)
})

test('createProvider - fsRootPath takes precedence over vfsDbPath', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'regina-provider-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const provider = createProvider({
    definitionPath: '/test',
    vfsDbPath: join(dir, 'test.sqlite'),
    fsRootPath: dir
  })
  ok(provider instanceof RealFSProvider)
})
