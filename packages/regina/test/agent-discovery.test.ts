import { strictEqual, deepStrictEqual, ok } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseAgentDefinition, discoverAgents } from '../src/agent-discovery.ts'

const validMd = `---
name: test-agent
description: A test agent
model: claude-sonnet-4-5
provider: anthropic
tools:
  - ./tools/search.js
temperature: 0.7
maxSteps: 5
---

You are a test agent.

## Guidelines
- Be helpful`

test('parseAgentDefinition - parses valid markdown', () => {
  const def = parseAgentDefinition(validMd, '/tmp/test.md')
  strictEqual(def.id, 'test-agent')
  strictEqual(def.name, 'test-agent')
  strictEqual(def.description, 'A test agent')
  strictEqual(def.model, 'claude-sonnet-4-5')
  strictEqual(def.provider, 'anthropic')
  deepStrictEqual(def.tools, ['./tools/search.js'])
  strictEqual(def.temperature, 0.7)
  strictEqual(def.maxSteps, 5)
  ok(def.systemPrompt.includes('You are a test agent'))
  ok(def.systemPrompt.includes('Be helpful'))
  strictEqual(def.filePath, '/tmp/test.md')
})

test('parseAgentDefinition - minimal frontmatter (name + model only)', () => {
  const md = `---
name: minimal
model: gpt-4o
---

Short prompt.`

  const def = parseAgentDefinition(md, '/tmp/minimal.md')
  strictEqual(def.id, 'minimal')
  strictEqual(def.model, 'gpt-4o')
  strictEqual(def.provider, undefined)
  deepStrictEqual(def.tools, [])
  strictEqual(def.temperature, undefined)
  strictEqual(def.maxSteps, undefined)
  strictEqual(def.systemPrompt, 'Short prompt.')
})

test('parseAgentDefinition - throws on missing frontmatter', () => {
  const md = 'Just some text without frontmatter'
  try {
    parseAgentDefinition(md, '/tmp/bad.md')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('missing YAML frontmatter'))
  }
})

test('parseAgentDefinition - throws on missing name', () => {
  const md = `---
model: gpt-4o
---

Prompt.`

  try {
    parseAgentDefinition(md, '/tmp/no-name.md')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('missing required field: name'))
  }
})

test('parseAgentDefinition - throws on missing model', () => {
  const md = `---
name: agent
---

Prompt.`

  try {
    parseAgentDefinition(md, '/tmp/no-model.md')
    ok(false, 'Should have thrown')
  } catch (err: any) {
    ok(err.message.includes('missing required field: model'))
  }
})

test('discoverAgents - scans directory for .md files', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'agents-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  await writeFile(join(dir, 'agent-a.md'), `---
name: agent-a
model: claude-sonnet-4-5
---

Agent A prompt.`)

  await writeFile(join(dir, 'agent-b.md'), `---
name: agent-b
model: gpt-4o
description: Agent B
---

Agent B prompt.`)

  // Non-md file should be ignored
  await writeFile(join(dir, 'readme.txt'), 'not an agent')

  const registry = await discoverAgents(dir)
  strictEqual(registry.size, 2)
  ok(registry.has('agent-a'))
  ok(registry.has('agent-b'))
  strictEqual(registry.get('agent-a')!.model, 'claude-sonnet-4-5')
  strictEqual(registry.get('agent-b')!.description, 'Agent B')
})

test('parseAgentDefinition - parses delegates from frontmatter', () => {
  const md = `---
name: orchestrator
model: claude-sonnet-4-5
delegates:
  - research-agent
  - writer-agent
---

You orchestrate.`

  const def = parseAgentDefinition(md, '/tmp/orch.md')
  deepStrictEqual(def.delegates, ['research-agent', 'writer-agent'])
})

test('parseAgentDefinition - delegates is undefined when absent', () => {
  const md = `---
name: simple
model: gpt-4o
---

Prompt.`

  const def = parseAgentDefinition(md, '/tmp/simple.md')
  strictEqual(def.delegates, undefined)
})

test('parseAgentDefinition - parses mcpServers from frontmatter', () => {
  const md = `---
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

You have MCP tools.`

  const def = parseAgentDefinition(md, '/tmp/mcp.md')
  ok(def.mcpServers)
  strictEqual(def.mcpServers!.length, 2)
  strictEqual(def.mcpServers![0].name, 'web-search')
  strictEqual(def.mcpServers![0].transport, 'sse')
  strictEqual(def.mcpServers![1].headers!.Authorization, 'Bearer token')
})

test('parseAgentDefinition - mcpServers is undefined when absent', () => {
  const md = `---
name: simple
model: gpt-4o
---

Prompt.`

  const def = parseAgentDefinition(md, '/tmp/simple2.md')
  strictEqual(def.mcpServers, undefined)
})

test('discoverAgents - returns empty map for non-existent directory', async () => {
  const registry = await discoverAgents('/tmp/nonexistent-agents-dir-' + Date.now())
  strictEqual(registry.size, 0)
})

test('discoverAgents - returns empty map for empty directory', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'empty-agents-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const registry = await discoverAgents(dir)
  strictEqual(registry.size, 0)
})
