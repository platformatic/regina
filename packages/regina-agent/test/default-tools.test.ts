import { strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { create as createVfs, MemoryProvider } from '@platformatic/vfs'
import { createDefaultTools } from '../src/default-tools.ts'

function setup () {
  const provider = new MemoryProvider()
  const vfs = createVfs(provider, { moduleHooks: false })
  const tools = createDefaultTools(vfs)
  return { vfs, tools }
}

test('default tools - returns bash, read_file, write_file, edit_file', () => {
  const { tools } = setup()
  ok(tools.bash)
  ok(tools.read_file)
  ok(tools.write_file)
  ok(tools.edit_file)
})

test('default tools - write_file creates file and parent dirs', async () => {
  const { tools } = setup()
  const writeTool = tools.write_file as any
  const result = await writeTool.execute({ path: '/tmp/test/hello.txt', content: 'hello world' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
  strictEqual(result.success, true)
})

test('default tools - read_file reads written file', async () => {
  const { vfs, tools } = setup()
  vfs.mkdirSync('/tmp', { recursive: true })
  vfs.writeFileSync('/tmp/read.txt', 'read me')
  const readTool = tools.read_file as any
  const result = await readTool.execute({ path: '/tmp/read.txt' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
  strictEqual(result.content, 'read me')
})

test('default tools - bash runs echo command', async () => {
  const { tools } = setup()
  const bashTool = tools.bash as any
  const result = await bashTool.execute({ command: 'echo "hello"' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
  strictEqual(result.stdout.trim(), 'hello')
  strictEqual(result.exitCode, 0)
})

test('default tools - bash sees files written by write_file (shared VFS)', async () => {
  const { tools } = setup()
  const writeTool = tools.write_file as any
  const bashTool = tools.bash as any

  await writeTool.execute({ path: '/tmp/shared.txt', content: 'shared data' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
  const result = await bashTool.execute({ command: 'cat /tmp/shared.txt' }, { toolCallId: '2', messages: [], abortSignal: undefined as any })
  strictEqual(result.stdout, 'shared data')
  strictEqual(result.exitCode, 0)
})

test('default tools - bash reports non-zero exit code on failure', async () => {
  const { tools } = setup()
  const bashTool = tools.bash as any
  const result = await bashTool.execute({ command: 'cat /nonexistent/file' }, { toolCallId: '1', messages: [], abortSignal: undefined as any })
  ok(result.exitCode !== 0)
})

const toolOpts = { toolCallId: '1', messages: [], abortSignal: undefined as any }

test('edit_file - replaces unique substring in file', async () => {
  const { vfs, tools } = setup()
  vfs.mkdirSync('/tmp', { recursive: true })
  vfs.writeFileSync('/tmp/edit.txt', 'hello world')
  const editTool = tools.edit_file as any
  const result = await editTool.execute({ path: '/tmp/edit.txt', old_string: 'world', new_string: 'earth' }, toolOpts)
  strictEqual(result.success, true)
  strictEqual(vfs.readFileSync('/tmp/edit.txt', 'utf-8'), 'hello earth')
})

test('edit_file - returns error when old_string not found', async () => {
  const { vfs, tools } = setup()
  vfs.mkdirSync('/tmp', { recursive: true })
  vfs.writeFileSync('/tmp/edit.txt', 'hello world')
  const editTool = tools.edit_file as any
  const result = await editTool.execute({ path: '/tmp/edit.txt', old_string: 'missing', new_string: 'nope' }, toolOpts)
  strictEqual(result.error, 'old_string not found in file')
})

test('edit_file - returns error when old_string has multiple matches', async () => {
  const { vfs, tools } = setup()
  vfs.mkdirSync('/tmp', { recursive: true })
  vfs.writeFileSync('/tmp/edit.txt', 'aaa bbb aaa')
  const editTool = tools.edit_file as any
  const result = await editTool.execute({ path: '/tmp/edit.txt', old_string: 'aaa', new_string: 'ccc' }, toolOpts)
  ok(result.error.includes('not unique'))
  ok(result.error.includes('2'))
})

test('edit_file - preserves rest of file content unchanged', async () => {
  const { vfs, tools } = setup()
  vfs.mkdirSync('/tmp', { recursive: true })
  vfs.writeFileSync('/tmp/edit.txt', 'line1\nline2\nline3\n')
  const editTool = tools.edit_file as any
  await editTool.execute({ path: '/tmp/edit.txt', old_string: 'line2', new_string: 'replaced' }, toolOpts)
  strictEqual(vfs.readFileSync('/tmp/edit.txt', 'utf-8'), 'line1\nreplaced\nline3\n')
})

test('edit_file - handles multiline old_string and new_string', async () => {
  const { vfs, tools } = setup()
  vfs.mkdirSync('/tmp', { recursive: true })
  vfs.writeFileSync('/tmp/edit.txt', 'start\nfoo\nbar\nend')
  const editTool = tools.edit_file as any
  const result = await editTool.execute({ path: '/tmp/edit.txt', old_string: 'foo\nbar', new_string: 'baz\nqux\nquux' }, toolOpts)
  strictEqual(result.success, true)
  strictEqual(vfs.readFileSync('/tmp/edit.txt', 'utf-8'), 'start\nbaz\nqux\nquux\nend')
})

test('edit_file - can delete text (new_string is empty)', async () => {
  const { vfs, tools } = setup()
  vfs.mkdirSync('/tmp', { recursive: true })
  vfs.writeFileSync('/tmp/edit.txt', 'keep remove keep')
  const editTool = tools.edit_file as any
  const result = await editTool.execute({ path: '/tmp/edit.txt', old_string: ' remove', new_string: '' }, toolOpts)
  strictEqual(result.success, true)
  strictEqual(vfs.readFileSync('/tmp/edit.txt', 'utf-8'), 'keep keep')
})
