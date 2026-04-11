import { request as undiciRequest } from 'undici'
import type { FastifyInstance } from 'fastify'
import type { InstanceManager } from '../instance-manager.ts'

export async function chatRoutes (app: FastifyInstance) {
  const instanceManager: InstanceManager = (app as any).instanceManager

  app.post('/instances/:instanceId/chat', {
    schema: {
      operationId: 'chat',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      },
      body: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        },
        required: ['message']
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

    const { message } = request.body as { message: string }
    const { body } = await undiciRequest(`http://${instanceId}.plt.local/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message })
    })

    const result = await body.json()
    instanceManager.refreshTimer(instanceId)
    return result
  })

  app.post('/instances/:instanceId/chat/stream', {
    schema: {
      operationId: 'chatStream',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      },
      body: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        },
        required: ['message']
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

    const { message } = request.body as { message: string }
    const { body } = await undiciRequest(`http://${instanceId}.plt.local/chat/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message })
    })

    reply.header('Content-Type', 'application/x-ndjson')
    reply.header('Cache-Control', 'no-cache')
    reply.header('Connection', 'keep-alive')

    return reply.send(body)
  })

  app.post('/instances/:instanceId/steer', {
    schema: {
      operationId: 'steer',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      },
      body: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        },
        required: ['message']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            queued: { type: 'boolean' }
          }
        }
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

    const { message } = request.body as { message: string }
    const { body } = await undiciRequest(`http://${instanceId}.plt.local/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message })
    })

    return body.json()
  })

  app.get('/instances/:instanceId/messages', {
    schema: {
      operationId: 'getMessages',
      params: {
        type: 'object',
        properties: {
          instanceId: { type: 'string' }
        },
        required: ['instanceId']
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              content: { type: 'string' }
            }
          }
        }
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

    const { body } = await undiciRequest(`http://${instanceId}.plt.local/messages`)
    return body.json()
  })
}
