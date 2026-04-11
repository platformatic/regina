import { strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { create as createVfs, MemoryProvider } from '@platformatic/vfs'
import { VfsAdapter } from '../src/vfs-adapter.ts'

function setup () {
  const provider = new MemoryProvider()
  const vfs = createVfs(provider, { moduleHooks: false })
  const adapter = new VfsAdapter(vfs)
  return { vfs, adapter }
}

test('VfsAdapter - writeFile + readFile roundtrip', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/hello.txt', 'hello world')
  const content = await adapter.readFile('/tmp/hello.txt')
  strictEqual(content, 'hello world')
})

test('VfsAdapter - readFileBuffer returns Uint8Array', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/bin.txt', 'binary')
  const buf = await adapter.readFileBuffer('/tmp/bin.txt')
  ok(buf instanceof Uint8Array)
  strictEqual(Buffer.from(buf).toString(), 'binary')
})

test('VfsAdapter - mkdir + readdir', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/mydir/sub', { recursive: true })
  await adapter.writeFile('/mydir/a.txt', 'a')
  await adapter.writeFile('/mydir/b.txt', 'b')
  const entries = await adapter.readdir('/mydir')
  ok(entries.includes('a.txt'))
  ok(entries.includes('b.txt'))
  ok(entries.includes('sub'))
})

test('VfsAdapter - readdirWithFileTypes', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/dir', { recursive: true })
  await adapter.writeFile('/dir/file.txt', 'x')
  await adapter.mkdir('/dir/child', { recursive: true })
  const entries = await adapter.readdirWithFileTypes('/dir')
  const file = entries.find(e => e.name === 'file.txt')
  const dir = entries.find(e => e.name === 'child')
  ok(file)
  strictEqual(file!.isFile, true)
  strictEqual(file!.isDirectory, false)
  ok(dir)
  strictEqual(dir!.isDirectory, true)
  strictEqual(dir!.isFile, false)
})

test('VfsAdapter - exists', async () => {
  const { adapter } = setup()
  strictEqual(await adapter.exists('/nope'), false)
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/exists.txt', 'yes')
  strictEqual(await adapter.exists('/tmp/exists.txt'), true)
})

test('VfsAdapter - stat', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/stat.txt', 'data')
  const stats = await adapter.stat('/tmp/stat.txt')
  strictEqual(stats.isFile, true)
  strictEqual(stats.isDirectory, false)
  ok(stats.mtime instanceof Date)

  const dirStats = await adapter.stat('/tmp')
  strictEqual(dirStats.isDirectory, true)
  strictEqual(dirStats.isFile, false)
})

test('VfsAdapter - rm file', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/del.txt', 'gone')
  strictEqual(await adapter.exists('/tmp/del.txt'), true)
  await adapter.rm('/tmp/del.txt')
  strictEqual(await adapter.exists('/tmp/del.txt'), false)
})

test('VfsAdapter - rm directory recursive', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/rmdir/sub', { recursive: true })
  await adapter.writeFile('/rmdir/sub/file.txt', 'x')
  await adapter.rm('/rmdir', { recursive: true })
  strictEqual(await adapter.exists('/rmdir'), false)
})

test('VfsAdapter - mv', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/old.txt', 'moved')
  await adapter.mv('/tmp/old.txt', '/tmp/new.txt')
  strictEqual(await adapter.exists('/tmp/old.txt'), false)
  strictEqual(await adapter.readFile('/tmp/new.txt'), 'moved')
})

test('VfsAdapter - appendFile', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/app.txt', 'hello')
  await adapter.appendFile('/tmp/app.txt', ' world')
  strictEqual(await adapter.readFile('/tmp/app.txt'), 'hello world')
})

test('VfsAdapter - cp file', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/tmp', { recursive: true })
  await adapter.writeFile('/tmp/src.txt', 'copy me')
  await adapter.cp('/tmp/src.txt', '/tmp/dest.txt')
  strictEqual(await adapter.readFile('/tmp/dest.txt'), 'copy me')
})

test('VfsAdapter - resolvePath', () => {
  const { adapter } = setup()
  strictEqual(adapter.resolvePath('/home', 'user'), '/home/user')
  strictEqual(adapter.resolvePath('/home/user', '../root'), '/home/root')
})

test('VfsAdapter - getAllPaths', async () => {
  const { adapter } = setup()
  await adapter.mkdir('/a/b', { recursive: true })
  await adapter.writeFile('/a/file.txt', 'x')
  await adapter.writeFile('/a/b/deep.txt', 'y')
  const paths = adapter.getAllPaths()
  ok(paths.includes('/a'))
  ok(paths.includes('/a/file.txt'))
  ok(paths.includes('/a/b'))
  ok(paths.includes('/a/b/deep.txt'))
})

test('VfsAdapter - chmod is a no-op', async () => {
  const { adapter } = setup()
  await adapter.chmod('/whatever', 0o755) // should not throw
})

test('VfsAdapter - utimes is a no-op', async () => {
  const { adapter } = setup()
  await adapter.utimes('/whatever', new Date(), new Date()) // should not throw
})

test('VfsAdapter - link throws', async () => {
  const { adapter } = setup()
  try {
    await adapter.link('/a', '/b')
    ok(false, 'should have thrown')
  } catch (err: any) {
    ok(err.message.includes('not supported'))
  }
})
