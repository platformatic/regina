export interface ReginaMetrics {
  instancesActive: {
    inc: (labels: { definition_id: string, status: string }) => void
    dec: (labels: { definition_id: string, status: string }) => void
  }
  instanceSpawnsTotal: { inc: (labels: { definition_id: string }) => void }
  instanceRemovalsTotal: { inc: (labels: { definition_id: string }) => void }
  instanceSuspensionsTotal: { inc: (labels: { definition_id: string }) => void }
  instanceResumesTotal: { inc: (labels: { definition_id: string }) => void }
  instanceSpawnDuration: { startTimer: (labels: { definition_id: string }) => () => number }
}

export function createMetrics (): ReginaMetrics | null {
  const prometheus = (globalThis as any).platformatic?.prometheus
  if (!prometheus) return null

  const { client, registry } = prometheus

  const instancesActive = new client.Gauge({
    name: 'regina_instances_active',
    help: 'Current instance count',
    labelNames: ['definition_id', 'status'],
    registers: [registry]
  })

  const instanceSpawnsTotal = new client.Counter({
    name: 'regina_instance_spawns_total',
    help: 'Total spawns',
    labelNames: ['definition_id'],
    registers: [registry]
  })

  const instanceRemovalsTotal = new client.Counter({
    name: 'regina_instance_removals_total',
    help: 'Total removals',
    labelNames: ['definition_id'],
    registers: [registry]
  })

  const instanceSuspensionsTotal = new client.Counter({
    name: 'regina_instance_suspensions_total',
    help: 'Idle suspensions',
    labelNames: ['definition_id'],
    registers: [registry]
  })

  const instanceResumesTotal = new client.Counter({
    name: 'regina_instance_resumes_total',
    help: 'Resumes',
    labelNames: ['definition_id'],
    registers: [registry]
  })

  const instanceSpawnDuration = new client.Histogram({
    name: 'regina_instance_spawn_duration_seconds',
    help: 'Spawn latency',
    labelNames: ['definition_id'],
    registers: [registry]
  })

  return {
    instancesActive,
    instanceSpawnsTotal,
    instanceRemovalsTotal,
    instanceSuspensionsTotal,
    instanceResumesTotal,
    instanceSpawnDuration
  }
}
