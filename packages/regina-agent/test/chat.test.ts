import { strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { tool, type CoreMessage } from 'ai'
import { MockLanguageModelV1 } from 'ai/test'
import { z } from 'zod'
import { handleChat } from '../src/ai-handler.ts'
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

function createMockModel (responseText: string = 'Hello from mock!') {
  return new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      text: responseText,
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5 }
    })
  })
}

test('handleChat - returns text response with usage', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = createMockModel('Test response')

  const result = await handleChat({
    message: 'Hello',
    messages,
    definition,
    tools: {},
    model
  })

  strictEqual(result.text, 'Test response')
  ok(result.usage, 'should return usage')
  strictEqual(result.usage!.promptTokens, 10)
  strictEqual(result.usage!.completionTokens, 5)
})

test('handleChat - appends user and assistant messages', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = createMockModel()

  await handleChat({
    message: 'Hi',
    messages,
    definition,
    tools: {},
    model
  })

  strictEqual(messages.length, 2) // user + assistant
  strictEqual(messages[0].role, 'user')
  strictEqual(messages[0].content, 'Hi')
  strictEqual(messages[1].role, 'assistant')
  strictEqual(messages[1].content, 'Hello from mock!')
})

test('handleChat - accumulates message history', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()

  let callCount = 0
  const model = new MockLanguageModelV1({
    doGenerate: async () => {
      callCount++
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: `Response ${callCount}`,
        finishReason: 'stop' as const,
        usage: { promptTokens: 10, completionTokens: 5 }
      }
    }
  })

  await handleChat({
    message: 'First message',
    messages,
    definition,
    tools: {},
    model
  })

  await handleChat({
    message: 'Second message',
    messages,
    definition,
    tools: {},
    model
  })

  strictEqual(messages.length, 4) // 2 user + 2 assistant
})

test('handleChat - passes system prompt to model', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  definition.systemPrompt = 'Custom system prompt'

  let receivedPrompt: any[] = []
  const model = new MockLanguageModelV1({
    doGenerate: async (options) => {
      receivedPrompt = options.prompt
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: 'ok',
        finishReason: 'stop' as const,
        usage: { promptTokens: 1, completionTokens: 1 }
      }
    }
  })

  await handleChat({
    message: 'test',
    messages,
    definition,
    tools: {},
    model
  })

  const systemMessage = receivedPrompt.find((m: any) => m.role === 'system')
  ok(systemMessage, 'should include a system message in prompt')
  ok(systemMessage.content.includes('Custom system prompt'), 'system message should contain the system prompt')
})

test('handleChat - includes delegation instructions when delegate tool is available', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  definition.delegates = ['research-agent', 'writer-agent']

  let receivedPrompt: any[] = []
  const model = new MockLanguageModelV1({
    doGenerate: async (options) => {
      receivedPrompt = options.prompt
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: 'ok',
        finishReason: 'stop' as const,
        usage: { promptTokens: 1, completionTokens: 1 }
      }
    }
  })

  const delegateTool = tool({
    description: 'Delegate to another agent',
    parameters: z.object({
      agentType: z.string(),
      message: z.string()
    }),
    execute: async () => ({ ok: true })
  })

  await handleChat({
    message: 'test',
    messages,
    definition,
    tools: { delegate: delegateTool },
    model,
    delegateAgents: [
      { id: 'research-agent', name: 'Research Agent', description: 'Finds facts and gathers evidence' },
      { id: 'writer-agent', name: 'Writer Agent', description: 'Produces polished user-facing copy' }
    ]
  })

  const systemMessage = receivedPrompt.find((m: any) => m.role === 'system')
  ok(systemMessage.content.includes('internal mesh network'))
  ok(systemMessage.content.includes('delegate'))
  ok(systemMessage.content.includes('research-agent, writer-agent'))
  ok(systemMessage.content.includes('find or spawn the target agent instance'))
  ok(systemMessage.content.includes('Research Agent'))
  ok(systemMessage.content.includes('Finds facts and gathers evidence'))
  ok(systemMessage.content.includes('Writer Agent'))
})

test('handleChat - does not include delegation instructions without delegate tool', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  definition.delegates = ['research-agent']

  let receivedPrompt: any[] = []
  const model = new MockLanguageModelV1({
    doGenerate: async (options) => {
      receivedPrompt = options.prompt
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: 'ok',
        finishReason: 'stop' as const,
        usage: { promptTokens: 1, completionTokens: 1 }
      }
    }
  })

  await handleChat({
    message: 'test',
    messages,
    definition,
    tools: {},
    model
  })

  const systemMessage = receivedPrompt.find((m: any) => m.role === 'system')
  ok(!systemMessage.content.includes('internal mesh network'))
})

test('handleChat - calls onStepFinish callback with StepResult', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()
  const model = createMockModel('done')
  let called = 0
  let receivedStep: any

  await handleChat({
    message: 'Hi',
    messages,
    definition,
    tools: {},
    model,
    onStepFinish (step) {
      called++
      receivedStep = step
    }
  })

  // generateText with a single text response fires onStepFinish once
  strictEqual(called, 1)
  ok(receivedStep, 'should pass step result')
  ok(receivedStep.usage, 'step should have usage')
  strictEqual(receivedStep.usage.promptTokens, 10)
  strictEqual(receivedStep.usage.completionTokens, 5)
})

test('handleChat - passes messages history to model', async () => {
  const messages: CoreMessage[] = []
  const definition = createTestDefinition()

  let receivedMessages: any[] = []
  const model = new MockLanguageModelV1({
    doGenerate: async (options) => {
      receivedMessages = options.prompt
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: 'ok',
        finishReason: 'stop' as const,
        usage: { promptTokens: 1, completionTokens: 1 }
      }
    }
  })

  await handleChat({
    message: 'First',
    messages,
    definition,
    tools: {},
    model
  })

  await handleChat({
    message: 'Second',
    messages,
    definition,
    tools: {},
    model
  })

  // On second call, the model should receive the full history
  ok(receivedMessages.length >= 3, 'should include previous messages')
})
