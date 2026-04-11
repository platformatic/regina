import { deepStrictEqual, strictEqual } from 'node:assert'
import test from 'node:test'
import { MockLanguageModelV1 } from 'ai/test'
import type { CoreMessage } from 'ai'
import { estimateTokens, compactMessages } from '../src/compaction.ts'

test('estimateTokens - returns 0 for empty messages', () => {
  strictEqual(estimateTokens([]), 0)
})

test('estimateTokens - estimates based on character count', () => {
  const messages: CoreMessage[] = [
    { role: 'user', content: 'Hello world' } // 11 chars -> ceil(11/4) = 3
  ]
  strictEqual(estimateTokens(messages), 3)
})

test('estimateTokens - sums across multiple messages', () => {
  const messages: CoreMessage[] = [
    { role: 'user', content: 'aaaa' }, // 4 chars -> 1
    { role: 'assistant', content: 'bbbbbbbb' } // 8 chars -> 2
  ]
  strictEqual(estimateTokens(messages), 3)
})

test('estimateTokens - handles array content with text parts', () => {
  const messages: CoreMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
  ]
  // 'Hello' is 5 chars -> ceil(5/4) = 2
  strictEqual(estimateTokens(messages), 2)
})

test('compactMessages - no-op when under threshold', async () => {
  const messages: CoreMessage[] = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello' }
  ]
  const original = [...messages]
  const model = new MockLanguageModelV1({})

  const compacted = await compactMessages(messages, model, { threshold: 100_000 })

  strictEqual(compacted, false)
  deepStrictEqual(messages, original)
})

test('compactMessages - summarizes old messages when over threshold', async () => {
  // Build messages that exceed a low threshold
  const messages: CoreMessage[] = []
  for (let i = 0; i < 20; i++) {
    messages.push({ role: 'user', content: 'x'.repeat(100) })
    messages.push({ role: 'assistant', content: 'y'.repeat(100) })
  }

  const model = new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      text: 'Summary of the conversation.',
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 10 }
    })
  })

  const compacted = await compactMessages(messages, model, { threshold: 100, keepLastN: 10 })

  strictEqual(compacted, true)
  // Should be: summary user msg + summary ack msg + 10 kept messages = 12
  strictEqual(messages.length, 12)
  strictEqual(messages[0].role, 'user')
  strictEqual((messages[0].content as string).includes('Summary of the conversation.'), true)
  strictEqual(messages[1].role, 'assistant')
})

test('compactMessages - preserves last N messages verbatim', async () => {
  const messages: CoreMessage[] = []
  for (let i = 0; i < 20; i++) {
    messages.push({ role: 'user', content: `msg-${i}-${'x'.repeat(100)}` })
  }

  const model = new MockLanguageModelV1({
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      text: 'Summary.',
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 10 }
    })
  })

  const keepLastN = 5
  const lastFive = messages.slice(-keepLastN).map(m => ({ ...m }))

  await compactMessages(messages, model, { threshold: 100, keepLastN })

  // Last 5 messages should be preserved exactly
  const kept = messages.slice(2) // skip summary pair
  strictEqual(kept.length, keepLastN)
  for (let i = 0; i < keepLastN; i++) {
    strictEqual(kept[i].content, lastFive[i].content)
  }
})

test('compactMessages - no-op when all messages fit in keepLastN', async () => {
  const messages: CoreMessage[] = [
    { role: 'user', content: 'x'.repeat(1000) },
    { role: 'assistant', content: 'y'.repeat(1000) }
  ]
  const original = [...messages]
  const model = new MockLanguageModelV1({})

  // threshold is low but keepLastN covers all messages
  const compacted = await compactMessages(messages, model, { threshold: 1, keepLastN: 10 })

  strictEqual(compacted, false)
  deepStrictEqual(messages, original)
})
