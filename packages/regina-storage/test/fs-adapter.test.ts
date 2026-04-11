import { deepStrictEqual, strictEqual } from 'node:assert'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { FsAdapter } from '../src/fs-adapter.ts'

const basePath = join(tmpdir(), `regina-fs-test-${Date.now()}`)
const adapter = new FsAdapter({ basePath })

after(async () => {
  await adapter.close()
  await rm(basePath, { recursive: true, force: true })
})

test('put and get roundtrip', async () => {
  const data = Buffer.from('hello world')
  await adapter.put('test-key', data)
  const result = await adapter.get('test-key')
  deepStrictEqual(result, data)
})

test('get missing key returns null', async () => {
  const result = await adapter.get('nonexistent')
  strictEqual(result, null)
})

test('delete removes a key', async () => {
  const data = Buffer.from('to delete')
  await adapter.put('delete-me', data)
  await adapter.delete('delete-me')
  const result = await adapter.get('delete-me')
  strictEqual(result, null)
})

test('delete missing key does not throw', async () => {
  await adapter.delete('no-such-key')
})

test('list filters by prefix', async () => {
  await adapter.put('app-one', Buffer.from('1'))
  await adapter.put('app-two', Buffer.from('2'))
  await adapter.put('other', Buffer.from('3'))

  const result = await adapter.list('app-')
  deepStrictEqual(result.sort(), ['app-one', 'app-two'])
})

test('list returns empty for no matches', async () => {
  const result = await adapter.list('zzz-')
  deepStrictEqual(result, [])
})

test('list on nonexistent dir returns empty', async () => {
  const emptyAdapter = new FsAdapter({ basePath: join(tmpdir(), `nonexistent-${Date.now()}`) })
  const result = await emptyAdapter.list('')
  deepStrictEqual(result, [])
})
