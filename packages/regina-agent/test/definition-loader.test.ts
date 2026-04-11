import { strictEqual, deepStrictEqual, ok } from 'node:assert'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { loadDefinition } from '../src/definition-loader.ts'

test('loadDefinition - loads and parses valid agent markdown', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await mkdir(join(dir, 'tools'), { recursive: true })
  await writeFile(join(dir, 'agent.md'), `---
name: test-agent
description: A test agent
model: claude-sonnet-4-5
provider: anthropic
tools:
  - ./tools/search.js
temperature: 0.7
maxSteps: 5
---

You are a test agent.`)

  const def = await loadDefinition(join(dir, 'agent.md'))
  strictEqual(def.id, 'test-agent')
  strictEqual(def.name, 'test-agent')
  strictEqual(def.description, 'A test agent')
  strictEqual(def.model, 'claude-sonnet-4-5')
  strictEqual(def.provider, 'anthropic')
  // Tool paths should be resolved relative to the .md file
  deepStrictEqual(def.tools, [resolve(dir, 'tools/search.js')])
  strictEqual(def.temperature, 0.7)
  strictEqual(def.maxSteps, 5)
  strictEqual(def.systemPrompt, 'You are a test agent.')
})

test('loadDefinition - minimal definition', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), `---
name: minimal
model: gpt-4o
---

Prompt.`)

  const def = await loadDefinition(join(dir, 'agent.md'))
  strictEqual(def.id, 'minimal')
  strictEqual(def.model, 'gpt-4o')
  strictEqual(def.provider, undefined)
  deepStrictEqual(def.tools, [])
})

test('loadDefinition - throws on missing frontmatter', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), 'No frontmatter here')

  try {
    await loadDefinition(join(dir, 'agent.md'))
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('missing YAML frontmatter'))
  }
})

test('loadDefinition - throws on missing name', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), `---
model: gpt-4o
---

Prompt.`)

  try {
    await loadDefinition(join(dir, 'agent.md'))
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('missing required field: name'))
  }
})

test('loadDefinition - throws on missing model', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), `---
name: agent
---

Prompt.`)

  try {
    await loadDefinition(join(dir, 'agent.md'))
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('missing required field: model'))
  }
})

test('loadDefinition - parses delegates from frontmatter', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), `---
name: orchestrator
model: claude-sonnet-4-5
delegates:
  - research-agent
  - writer-agent
---

You orchestrate.`)

  const def = await loadDefinition(join(dir, 'agent.md'))
  deepStrictEqual(def.delegates, ['research-agent', 'writer-agent'])
})

test('loadDefinition - delegates is undefined when absent', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), `---
name: minimal
model: gpt-4o
---

Prompt.`)

  const def = await loadDefinition(join(dir, 'agent.md'))
  strictEqual(def.delegates, undefined)
})

test('loadDefinition - parses mcpServers from frontmatter', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), `---
name: mcp-agent
model: claude-sonnet-4-5
mcpServers:
  - name: web-search
    transport: sse
    url: http://localhost:3001/sse
  - name: api-server
    transport: http
    url: http://localhost:3002/mcp
    headers:
      Authorization: "Bearer token"
---

You have MCP tools.`)

  const def = await loadDefinition(join(dir, 'agent.md'))
  ok(def.mcpServers)
  strictEqual(def.mcpServers!.length, 2)
  strictEqual(def.mcpServers![0].name, 'web-search')
  strictEqual(def.mcpServers![0].transport, 'sse')
  strictEqual(def.mcpServers![0].url, 'http://localhost:3001/sse')
  strictEqual(def.mcpServers![1].name, 'api-server')
  strictEqual(def.mcpServers![1].transport, 'http')
  deepStrictEqual(def.mcpServers![1].headers, { Authorization: 'Bearer token' })
})

test('loadDefinition - mcpServers is undefined when absent', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-def-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent.md'), `---
name: minimal
model: gpt-4o
---

Prompt.`)

  const def = await loadDefinition(join(dir, 'agent.md'))
  strictEqual(def.mcpServers, undefined)
})

test('loadDefinition - throws on non-existent file', async () => {
  try {
    await loadDefinition('/tmp/nonexistent-' + Date.now() + '.md')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    strictEqual(err.code, 'ENOENT')
  }
})
