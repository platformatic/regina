import { strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { createMetrics } from '../src/metrics.ts'

test('createMetrics returns null when prometheus is unavailable', () => {
  const result = createMetrics()
  strictEqual(result, null)
})

test('createMetrics returns metric objects when prometheus is available', () => {
  const registeredMetrics: any[] = []

  class FakeCounter {
    name: string
    constructor (opts: any) {
      this.name = opts.name
      registeredMetrics.push(this)
    }

    inc () {}
  }

  class FakeHistogram {
    name: string
    constructor (opts: any) {
      this.name = opts.name
      registeredMetrics.push(this)
    }

    startTimer () { return () => 0 }
  }

  const fakeRegistry = {};
  (globalThis as any).platformatic = {
    prometheus: {
      client: { Counter: FakeCounter, Histogram: FakeHistogram },
      registry: fakeRegistry
    }
  }

  try {
    const metrics = createMetrics()
    ok(metrics, 'should return metrics object')
    ok(metrics!.chatRequestsTotal)
    ok(metrics!.chatDuration)
    ok(metrics!.tokensTotal)
    ok(metrics!.stepsTotal)
    ok(metrics!.toolCallsTotal)
    ok(metrics!.steeringMessagesTotal)

    const names = registeredMetrics.map(m => m.name)
    ok(names.includes('regina_agent_chat_requests_total'))
    ok(names.includes('regina_agent_chat_duration_seconds'))
    ok(names.includes('regina_agent_tokens_total'))
    ok(names.includes('regina_agent_steps_total'))
    ok(names.includes('regina_agent_tool_calls_total'))
    ok(names.includes('regina_agent_steering_messages_total'))
  } finally {
    delete (globalThis as any).platformatic
  }
})
