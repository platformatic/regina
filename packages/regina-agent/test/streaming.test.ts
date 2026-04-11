import { strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test'
import type { CoreMessage } from 'ai'
import { handleStreamChat } from '../src/ai-handler.ts'
import type { AgentDefinition } from '../src/definition-loader.ts'

function createTestDefinition (): AgentDefinition {
  return {
    id: 'test-agent',
    name: 'test-agent',
    model: 'mock-model',
    provider: 'anthropic',
    tools: [],
    systemPrompt: 'You are a helpful test agent.',
    filePath: '/tmp/test-agent.md'
  }
}

test('handleStreamChat - returns a stream result', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', textDelta: 'Hello' },
          { type: 'text-delta', textDelta: ' world' },
          { type: 'finish', finishReason: 'stop', usage: { promptTokens: 5, completionTokens: 2 }, logprobs: undefined }
        ]
      }),
      rawCall: { rawPrompt: null, rawSettings: {} }
    })
  })

  const { result } = await handleStreamChat({
    message: 'Hi',
    messages,
    definition,
    tools: {},
    model
  })

  ok(result, 'should return a result')
  ok(result.fullStream, 'result should have fullStream')
})

test('handleStreamChat - fullStream produces structured events', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', textDelta: 'chunk1' },
          { type: 'text-delta', textDelta: 'chunk2' },
          { type: 'finish', finishReason: 'stop', usage: { promptTokens: 5, completionTokens: 2 }, logprobs: undefined }
        ]
      }),
      rawCall: { rawPrompt: null, rawSettings: {} }
    })
  })

  const { result } = await handleStreamChat({
    message: 'Hello',
    messages,
    definition,
    tools: {},
    model
  })

  const events: any[] = []
  for await (const event of result.fullStream) {
    events.push(event)
  }

  const textDeltas = events.filter(e => e.type === 'text-delta')
  ok(textDeltas.length >= 2, 'should produce at least 2 text-delta events')
  ok(textDeltas.some(e => e.textDelta === 'chunk1'), 'should contain chunk1')
  ok(textDeltas.some(e => e.textDelta === 'chunk2'), 'should contain chunk2')
})

test('handleStreamChat - appends user message immediately', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', textDelta: 'hi' },
          { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, logprobs: undefined }
        ]
      }),
      rawCall: { rawPrompt: null, rawSettings: {} }
    })
  })

  await handleStreamChat({
    message: 'test',
    messages,
    definition,
    tools: {},
    model
  })

  // User message should already be appended
  strictEqual(messages.length, 1)
  strictEqual(messages[0].role, 'user')
  strictEqual(messages[0].content, 'test')
})

test('handleStreamChat - accumulates messages across calls', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', textDelta: 'hi' },
          { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, logprobs: undefined }
        ]
      }),
      rawCall: { rawPrompt: null, rawSettings: {} }
    })
  })

  await handleStreamChat({
    message: 'first',
    messages,
    definition,
    tools: {},
    model
  })

  await handleStreamChat({
    message: 'second',
    messages,
    definition,
    tools: {},
    model
  })

  strictEqual(messages.length, 2) // both user messages
  strictEqual(messages[0].content, 'first')
  strictEqual(messages[1].content, 'second')
})

test('handleStreamChat - appends assistant response on finish', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', textDelta: 'streamed response' },
          { type: 'finish', finishReason: 'stop', usage: { promptTokens: 5, completionTokens: 2 }, logprobs: undefined }
        ]
      }),
      rawCall: { rawPrompt: null, rawSettings: {} }
    })
  })

  const { result } = await handleStreamChat({
    message: 'Hello',
    messages,
    definition,
    tools: {},
    model
  })

  // Consume the stream to trigger onFinish
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of result.fullStream) { /* drive the pipeline */ }
  await result.text

  strictEqual(messages.length, 2) // user + assistant
  strictEqual(messages[1].role, 'assistant')
  ok(messages[1].content.includes('streamed response'))
})
