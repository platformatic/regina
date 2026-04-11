import { request as undiciRequest } from 'undici'
import type { FastifyInstance } from 'fastify'
import type { AgentDefinition } from '../agent-discovery.ts'
import type { InstanceManager } from '../instance-manager.ts'

const MAX_DELEGATION_DEPTH = 5

export async function delegateRoutes (app: FastifyInstance) {
  const definitions: Map<string, AgentDefinition> = (app as any).agentDefinitions
  const instanceManager: InstanceManager = (app as any).instanceManager

  app.post('/delegate', {
    schema: {
      operationId: 'delegate',
      body: {
        type: 'object',
        properties: {
          agentType: { type: 'string' },
          message: { type: 'string' },
          callerInstanceId: { type: 'string' }
        },
        required: ['agentType', 'message', 'callerInstanceId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            usage: {
              type: 'object',
              properties: {
                promptTokens: { type: 'integer' },
                completionTokens: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { agentType, message, callerInstanceId } = request.body as {
      agentType: string
      message: string
      callerInstanceId: string
    }

    // Validate target agent type exists
    if (!definitions.has(agentType)) {
      return (reply as any).code(404).send({ error: `Agent type not found: ${agentType}` })
    }

    // Validate caller instance exists and is allowed to delegate
    const callerInstance = instanceManager.getInstance(callerInstanceId)
    if (!callerInstance) {
      return (reply as any).code(403).send({ error: 'Caller instance not found' })
    }

    const callerDef = definitions.get(callerInstance.definitionId)
    if (!callerDef?.delegates?.includes(agentType)) {
      return (reply as any).code(403).send({ error: `Agent ${callerInstance.definitionId} is not allowed to delegate to ${agentType}` })
    }

    // Check delegation depth
    const depthHeader = request.headers['x-delegation-depth']
    const currentDepth = depthHeader ? parseInt(String(depthHeader), 10) : 0
    if (currentDepth >= MAX_DELEGATION_DEPTH) {
      return (reply as any).code(400).send({ error: 'Maximum delegation depth exceeded' })
    }

    // Find or spawn the target instance
    const targetInstance = await instanceManager.findOrSpawnInstance(agentType)

    // Proxy the message to the target agent
    const { body } = await undiciRequest(`http://${targetInstance.instanceId}.plt.local/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-delegation-depth': String(currentDepth + 1)
      },
      body: JSON.stringify({ message })
    })

    const result = await body.json()
    instanceManager.refreshTimer(targetInstance.instanceId)
    return result
  })
}
