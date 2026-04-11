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

  class FakeGauge {
    name: string
    constructor (opts: any) {
      this.name = opts.name
      registeredMetrics.push(this)
    }

    inc () {}
    dec () {}
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
      client: { Counter: FakeCounter, Gauge: FakeGauge, Histogram: FakeHistogram },
      registry: fakeRegistry
    }
  }

  try {
    const metrics = createMetrics()
    ok(metrics, 'should return metrics object')
    ok(metrics!.instancesActive)
    ok(metrics!.instanceSpawnsTotal)
    ok(metrics!.instanceRemovalsTotal)
    ok(metrics!.instanceSuspensionsTotal)
    ok(metrics!.instanceResumesTotal)
    ok(metrics!.instanceSpawnDuration)

    const names = registeredMetrics.map(m => m.name)
    ok(names.includes('regina_instances_active'))
    ok(names.includes('regina_instance_spawns_total'))
    ok(names.includes('regina_instance_removals_total'))
    ok(names.includes('regina_instance_suspensions_total'))
    ok(names.includes('regina_instance_resumes_total'))
    ok(names.includes('regina_instance_spawn_duration_seconds'))
  } finally {
    delete (globalThis as any).platformatic
  }
})
