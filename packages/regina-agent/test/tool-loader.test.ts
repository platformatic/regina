import { strictEqual, ok } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadTools } from '../src/tool-loader.ts'

test('loadTools - loads valid tool modules', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tools-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'echo.mjs'), `
export default {
  parameters: { type: 'object', properties: { msg: { type: 'string' } } },
  execute: async ({ msg }) => ({ echo: msg })
}
`)

  const tools = await loadTools([join(dir, 'echo.mjs')])
  ok(tools.echo, 'should have echo tool')
  strictEqual(typeof tools.echo.execute, 'function')
})

test('loadTools - names tools by filename without extension', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tools-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'search-docs.mjs'), `
export default {
  parameters: { type: 'object', properties: {} },
  execute: async () => ({})
}
`)

  const tools = await loadTools([join(dir, 'search-docs.mjs')])
  ok(tools['search-docs'], 'should use filename as key')
})

test('loadTools - loads multiple tools', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tools-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'tool-a.mjs'), `
export default {
  parameters: { type: 'object', properties: {} },
  execute: async () => ({ a: true })
}
`)
  await writeFile(join(dir, 'tool-b.mjs'), `
export default {
  parameters: { type: 'object', properties: {} },
  execute: async () => ({ b: true })
}
`)

  const tools = await loadTools([join(dir, 'tool-a.mjs'), join(dir, 'tool-b.mjs')])
  ok(tools['tool-a'])
  ok(tools['tool-b'])
})

test('loadTools - returns empty object for no tool paths', async () => {
  const tools = await loadTools([])
  strictEqual(Object.keys(tools).length, 0)
})

test('loadTools - throws on invalid tool module', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tools-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'bad.mjs'), `
export default 'not a tool'
`)

  try {
    await loadTools([join(dir, 'bad.mjs')])
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('does not export a valid AI SDK tool'))
  }
})
