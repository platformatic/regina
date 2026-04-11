export interface ReginaAgentMetrics {
  chatRequestsTotal: { inc: (labels: { definition_id: string, type: string }) => void }
  chatDuration: { startTimer: (labels: { definition_id: string, type: string }) => () => number }
  tokensTotal: { inc: (labels: { definition_id: string, type: string }, value?: number) => void }
  stepsTotal: { inc: (labels: { definition_id: string }) => void }
  toolCallsTotal: { inc: (labels: { definition_id: string, tool_name: string }) => void }
  steeringMessagesTotal: { inc: (labels: { definition_id: string }) => void }
}

export function createMetrics (): ReginaAgentMetrics | null {
  const prometheus = (globalThis as any).platformatic?.prometheus
  if (!prometheus) return null

  const { client, registry } = prometheus

  const chatRequestsTotal = new client.Counter({
    name: 'regina_agent_chat_requests_total',
    help: 'Chat requests',
    labelNames: ['definition_id', 'type'],
    registers: [registry]
  })

  const chatDuration = new client.Histogram({
    name: 'regina_agent_chat_duration_seconds',
    help: 'Chat processing duration',
    labelNames: ['definition_id', 'type'],
    registers: [registry]
  })

  const tokensTotal = new client.Counter({
    name: 'regina_agent_tokens_total',
    help: 'Tokens consumed',
    labelNames: ['definition_id', 'type'],
    registers: [registry]
  })

  const stepsTotal = new client.Counter({
    name: 'regina_agent_steps_total',
    help: 'Agentic loop steps',
    labelNames: ['definition_id'],
    registers: [registry]
  })

  const toolCallsTotal = new client.Counter({
    name: 'regina_agent_tool_calls_total',
    help: 'Tool invocations',
    labelNames: ['definition_id', 'tool_name'],
    registers: [registry]
  })

  const steeringMessagesTotal = new client.Counter({
    name: 'regina_agent_steering_messages_total',
    help: 'Steering messages injected',
    labelNames: ['definition_id'],
    registers: [registry]
  })

  return {
    chatRequestsTotal,
    chatDuration,
    tokensTotal,
    stepsTotal,
    toolCallsTotal,
    steeringMessagesTotal
  }
}
