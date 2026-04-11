import type { FastifyInstance } from 'fastify'
import type { AgentDefinition } from '../agent-discovery.ts'

export async function agentRoutes (app: FastifyInstance) {
  const definitions: Map<string, AgentDefinition> = (app as any).agentDefinitions

  app.get('/agents', {
    schema: {
      operationId: 'listAgents',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              model: { type: 'string' },
              provider: { type: 'string' },
              tools: { type: 'array', items: { type: 'string' } },
              delegates: { type: 'array', items: { type: 'string' } },
              greeting: { type: 'string' }
            }
          }
        }
      }
    }
  }, async () => {
    return [...definitions.values()].map(d => ({
      id: d.id,
      name: d.name,
      description: d.description,
      model: d.model,
      provider: d.provider,
      tools: d.tools,
      delegates: d.delegates,
      greeting: d.greeting
    }))
  })

  app.get('/agents/:defId', {
    schema: {
      operationId: 'getAgent',
      params: {
        type: 'object',
        properties: {
          defId: { type: 'string' }
        },
        required: ['defId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            model: { type: 'string' },
            provider: { type: 'string' },
            tools: { type: 'array', items: { type: 'string' } },
            delegates: { type: 'array', items: { type: 'string' } },
            greeting: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { defId } = request.params as { defId: string }
    const definition = definitions.get(defId)
    if (!definition) {
      return (reply as any).code(404).send({ error: 'Agent definition not found' })
    }
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      model: definition.model,
      provider: definition.provider,
      tools: definition.tools,
      delegates: definition.delegates,
      greeting: definition.greeting
    }
  })
}
