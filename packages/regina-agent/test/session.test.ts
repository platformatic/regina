import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { CoreMessage } from 'ai'
import { create as createVfs, MemoryProvider, RealFSProvider } from '@platformatic/vfs'
import { loadMessages, appendMessages, rewriteMessages } from '../src/session.ts'

function setup () {
  const provider = new MemoryProvider()
  const vfs = createVfs(provider, { moduleHooks: false })
  return { vfs }
}

test('loadMessages - returns empty array when no session file', () => {
  const { vfs } = setup()
  const messages = loadMessages(vfs)
  deepStrictEqual(messages, [])
})

test('loadMessages - restores messages from JSONL', () => {
  const { vfs } = setup()
  const msg1: CoreMessage = { role: 'user', content: 'hello' }
  const msg2: CoreMessage = { role: 'assistant', content: 'hi there' }
  vfs.mkdirSync('/.session', { recursive: true })
  vfs.writeFileSync('/.session/messages.jsonl', JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n')

  const messages = loadMessages(vfs)
  deepStrictEqual(messages, [msg1, msg2])
})

test('appendMessages - creates .session dir and appends JSONL', () => {
  const { vfs } = setup()
  const msg: CoreMessage = { role: 'user', content: 'first' }

  appendMessages(vfs, msg)

  const content = vfs.readFileSync('/.session/messages.jsonl', 'utf-8')
  strictEqual(content, JSON.stringify(msg) + '\n')
})

test('appendMessages - appends to existing file', () => {
  const { vfs } = setup()
  const msg1: CoreMessage = { role: 'user', content: 'first' }
  const msg2: CoreMessage = { role: 'assistant', content: 'second' }

  appendMessages(vfs, msg1)
  appendMessages(vfs, msg2)

  const content = vfs.readFileSync('/.session/messages.jsonl', 'utf-8')
  strictEqual(content, JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n')
})

test('appendMessages - appends multiple messages at once', () => {
  const { vfs } = setup()
  const msg1: CoreMessage = { role: 'user', content: 'q' }
  const msg2: CoreMessage = { role: 'assistant', content: 'a' }

  appendMessages(vfs, msg1, msg2)

  const content = vfs.readFileSync('/.session/messages.jsonl', 'utf-8')
  strictEqual(content, JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n')
})

test('rewriteMessages - overwrites file (for post-compaction)', () => {
  const { vfs } = setup()
  const old1: CoreMessage = { role: 'user', content: 'old' }
  appendMessages(vfs, old1)

  const compacted: CoreMessage[] = [
    { role: 'user', content: 'summary' },
    { role: 'assistant', content: 'ack' }
  ]
  rewriteMessages(vfs, compacted)

  const content = vfs.readFileSync('/.session/messages.jsonl', 'utf-8')
  strictEqual(content, JSON.stringify(compacted[0]) + '\n' + JSON.stringify(compacted[1]) + '\n')
})

test('roundtrip - append then load preserves messages', () => {
  const { vfs } = setup()
  const msg1: CoreMessage = { role: 'user', content: 'hello' }
  const msg2: CoreMessage = { role: 'assistant', content: 'world' }

  appendMessages(vfs, msg1, msg2)
  const loaded = loadMessages(vfs)

  deepStrictEqual(loaded, [msg1, msg2])
})

test('RealFSProvider - messages persist to disk', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'regina-realfs-'))
  t.after(() => rm(rootPath, { recursive: true, force: true }))

  const provider = new RealFSProvider(rootPath)
  const vfs = createVfs(provider, { moduleHooks: false })

  const msg1: CoreMessage = { role: 'user', content: 'hello' }
  const msg2: CoreMessage = { role: 'assistant', content: 'world' }

  appendMessages(vfs, msg1, msg2)
  const loaded = loadMessages(vfs)
  deepStrictEqual(loaded, [msg1, msg2])

  // Create a new VFS from the same root — messages should persist
  const provider2 = new RealFSProvider(rootPath)
  const vfs2 = createVfs(provider2, { moduleHooks: false })
  const reloaded = loadMessages(vfs2)
  deepStrictEqual(reloaded, [msg1, msg2])
})
