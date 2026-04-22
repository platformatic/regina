import type { FastifyInstance } from 'fastify'
import type { InstanceManager } from '../instance-manager.ts'

export async function instanceRoutes (app: FastifyInstance) {
  const instanceManager: InstanceManager = (app as any).instanceManager

  app.post('/agents/:defId/instances', {
    schema: {
      operationId: 'spawnInstance',
      params: {
        type: 'object',
        properties: {
          defId: { type: 'string' }
        },
        required: ['defId']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            instanceId: { type: 'string' },
            definitionId: { type: 'string' },
            status: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { defId } = request.params as { defId: string }
    const info = await instanceManager.spawnInstance(defId)
    return reply.code(201).send(info)
  })

  app.get('/agents/:defId/instances', {
    schema: {
      operationId: 'listInstances',
      params: {
        type: 'object',
        properties: {
          defId: { type: 'string' }
        },
        required: ['defId']
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instanceId: { type: 'string' },
              definitionId: { type: 'string' },
              status: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { defId } = request.params as { defId: string }
    return instanceManager.listInstances(defId)
  })

  app.post('/instances/:instanceId/heartbeat', {
    schema: {
      operationId: 'heartbeat',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      }
    }
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string }
    let instance = instanceManager.getInstance(instanceId)
    if (!instance) {
      instance = await instanceManager.restoreInstance(instanceId) ?? undefined
    }
    if (!instance) {
      return (reply as any).code(404).send({ error: 'Instance not found' })
    }
    instanceManager.refreshTimer(instanceId)
    return reply.code(204).send()
  })

  app.post('/instances/:instanceId/suspend', {
    schema: {
      operationId: 'suspendInstance',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      }
    }
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string }
    const instance = instanceManager.getInstance(instanceId)
    if (!instance) {
      return (reply as any).code(404).send({ error: 'Instance not found' })
    }
    if (instance.status === 'suspended') {
      return reply.code(204).send()
    }
    await instanceManager.suspendInstance(instanceId)
    return reply.code(204).send()
  })

  app.post('/instances/:instanceId/resume', {
    schema: {
      operationId: 'resumeInstance',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      }
    }
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string }
    let instance = instanceManager.getInstance(instanceId)
    if (!instance) {
      instance = await instanceManager.restoreInstance(instanceId) ?? undefined
    }
    if (!instance) {
      return (reply as any).code(404).send({ error: 'Instance not found' })
    }

    if (instance.status === 'suspended') {
      await instanceManager.resumeInstance(instanceId)
    }
    instanceManager.refreshTimer(instanceId)
    return reply.code(204).send()
  })

  app.delete('/instances/:instanceId', {
    schema: {
      operationId: 'removeInstance',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      }
    }
  }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string }
    await instanceManager.removeInstance(instanceId)
    return reply.code(204).send()
  })
}
