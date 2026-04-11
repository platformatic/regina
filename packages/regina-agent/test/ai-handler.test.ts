import { strictEqual, throws } from 'node:assert'
import test from 'node:test'
import { resolveProvider } from '../src/ai-handler.ts'
import type { AgentDefinition } from '../src/definition-loader.ts'

function createDefinition (overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'test',
    name: 'test',
    model: 'claude-sonnet-4-5',
    tools: [],
    systemPrompt: 'You are a test agent.',
    filePath: '/tmp/test.md',
    ...overrides
  }
}

test('resolveProvider - explicit anthropic provider', () => {
  const definition = createDefinition({ provider: 'anthropic', model: 'claude-sonnet-4-5' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'anthropic.messages')
  strictEqual(model.modelId, 'claude-sonnet-4-5')
})

test('resolveProvider - explicit openai provider', () => {
  const definition = createDefinition({ provider: 'openai', model: 'gpt-4o' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
  strictEqual(model.modelId, 'gpt-4o')
})

test('resolveProvider - explicit vercel-gateway provider', () => {
  const definition = createDefinition({ provider: 'vercel-gateway', model: 'anthropic/claude-sonnet-4-5' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
  strictEqual(model.modelId, 'anthropic/claude-sonnet-4-5')
})

test('resolveProvider - infers anthropic from claude model', () => {
  const definition = createDefinition({ model: 'claude-sonnet-4-5' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'anthropic.messages')
})

test('resolveProvider - infers openai from gpt model', () => {
  const definition = createDefinition({ model: 'gpt-4o' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
})

test('resolveProvider - infers openai from o1 model', () => {
  const definition = createDefinition({ model: 'o1-preview' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
})

test('resolveProvider - infers openai from o3 model', () => {
  const definition = createDefinition({ model: 'o3-mini' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
})

test('resolveProvider - infers openai from o4 model', () => {
  const definition = createDefinition({ model: 'o4-mini' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
})

test('resolveProvider - infers vercel-gateway from model with slash', () => {
  const definition = createDefinition({ model: 'anthropic/claude-sonnet-4-5' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
  strictEqual(model.modelId, 'anthropic/claude-sonnet-4-5')
})

test('resolveProvider - infers vercel-gateway from openai model with slash', () => {
  const definition = createDefinition({ model: 'openai/gpt-4o' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
  strictEqual(model.modelId, 'openai/gpt-4o')
})

test('resolveProvider - infers vercel-gateway from xai model with slash', () => {
  const definition = createDefinition({ model: 'xai/grok-3' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'openai.chat')
  strictEqual(model.modelId, 'xai/grok-3')
})

test('resolveProvider - throws for unsupported provider', () => {
  const definition = createDefinition({ provider: 'unsupported' })
  throws(() => resolveProvider(definition, { apiKey: 'test-key' }), /Unsupported provider: unsupported/)
})

test('resolveProvider - throws for unknown model without provider', () => {
  const definition = createDefinition({ model: 'llama-3' })
  throws(() => resolveProvider(definition, { apiKey: 'test-key' }), /Cannot infer provider for model: llama-3/)
})

test('resolveProvider - explicit provider overrides inference', () => {
  const definition = createDefinition({ provider: 'anthropic', model: 'anthropic/claude-sonnet-4-5' })
  const model = resolveProvider(definition, { apiKey: 'test-key' })
  strictEqual(model.provider, 'anthropic.messages')
  strictEqual(model.modelId, 'anthropic/claude-sonnet-4-5')
})
