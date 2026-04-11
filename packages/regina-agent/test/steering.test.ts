import { strictEqual, deepStrictEqual } from 'node:assert'
import test from 'node:test'
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test'
import type { CoreMessage } from 'ai'
import { handleChat, handleStreamChat } from '../src/ai-handler.ts'
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

test('handleChat - steering message injected between steps', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const steeringQueue: string[] = []

  let stepCount = 0
  const model = new MockLanguageModelV1({
    doGenerate: async (options) => {
      stepCount++
      if (stepCount === 1) {
        // First step: simulate a tool call that will cause a second step
        // The steering message should be injected between steps
        return {
          rawCall: { rawPrompt: null, rawSettings: {} },
          text: 'Step 1 done',
          finishReason: 'stop' as const,
          usage: { promptTokens: 10, completionTokens: 5 }
        }
      }
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: 'Step 2 done',
        finishReason: 'stop' as const,
        usage: { promptTokens: 10, completionTokens: 5 }
      }
    }
  })

  // Queue a steering message before the call
  steeringQueue.push('Please focus on testing')

  await handleChat({
    message: 'Hello',
    messages,
    definition,
    tools: {},
    model,
    steeringQueue
  })

  // The steering message should have been drained from the queue
  strictEqual(steeringQueue.length, 0)
  // Messages should contain the steering message as a user message
  const steeringMsg = messages.find(m => m.role === 'user' && m.content === 'Please focus on testing')
  strictEqual(steeringMsg !== undefined, true, 'steering message should appear in messages')
})

test('handleChat - multiple steering messages drained at once', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const steeringQueue = ['msg1', 'msg2', 'msg3']

  const model = new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      text: 'done',
      finishReason: 'stop' as const,
      usage: { promptTokens: 1, completionTokens: 1 }
    })
  })

  await handleChat({
    message: 'Hello',
    messages,
    definition,
    tools: {},
    model,
    steeringQueue
  })

  strictEqual(steeringQueue.length, 0, 'all steering messages should be drained')
  const userMessages = messages.filter(m => m.role === 'user')
  // Original message + 3 steering messages
  strictEqual(userMessages.length, 4)
  deepStrictEqual(userMessages.map(m => m.content), ['Hello', 'msg1', 'msg2', 'msg3'])
})

test('handleChat - no steering messages means no extra messages', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const steeringQueue: string[] = []

  const model = new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      text: 'done',
      finishReason: 'stop' as const,
      usage: { promptTokens: 1, completionTokens: 1 }
    })
  })

  await handleChat({
    message: 'Hello',
    messages,
    definition,
    tools: {},
    model,
    steeringQueue
  })

  strictEqual(messages.length, 2, 'only user + assistant messages')
  strictEqual(messages[0].role, 'user')
  strictEqual(messages[1].role, 'assistant')
})

test('handleStreamChat - steering messages drained on step finish', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const steeringQueue = ['steer me']

  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', textDelta: 'Hello' },
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
    model,
    steeringQueue
  })

  // Consume the stream to trigger onStepFinish
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _ of result.fullStream) { /* drive the pipeline */ }
  await result.text

  strictEqual(steeringQueue.length, 0, 'steering messages should be drained')
  const steeringMsg = messages.find(m => m.role === 'user' && m.content === 'steer me')
  strictEqual(steeringMsg !== undefined, true, 'steering message should appear in messages')
})

test('handleChat - no steeringQueue (undefined) does not break onStepFinish', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()

  const model = new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      text: 'done',
      finishReason: 'stop' as const,
      usage: { promptTokens: 1, completionTokens: 1 }
    })
  })

  let stepFinished = false
  await handleChat({
    message: 'Hello',
    messages,
    definition,
    tools: {},
    model,
    onStepFinish (_step) { stepFinished = true }
  })

  strictEqual(stepFinished, true, 'onStepFinish should still be called without steeringQueue')
})
