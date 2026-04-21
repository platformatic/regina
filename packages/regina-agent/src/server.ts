import { getGlobal } from '@platformatic/globals'
import { create as createVfs } from '@platformatic/vfs'
import type { CoreMessage, StepResult, ToolSet } from 'ai'
import fastify, { FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { Readable } from 'node:stream'
import { handleChat, handleStreamChat, type ProviderSettings } from './ai-handler.ts'
import { createDefaultTools } from './default-tools.ts'
import { loadDefinition } from './definition-loader.ts'
import { createDelegateTool } from './delegate-tool.ts'
import { sanitizeEnv } from './env.ts'
import { createHeartbeat } from './heartbeat.ts'
import { loadMcpServers, type McpConnection } from './mcp-loader.ts'
import { createMetrics } from './metrics.ts'
import { ReginaAgentConfiguration } from './schema.ts'
import { appendMessages, loadMessages, rewriteMessages } from './session.ts'
import { loadTools } from './tool-loader.ts'
import { createProvider } from './vfs-provider.ts'

declare module 'fastify' {
  interface FastifyRequest {
    streamDone: Promise<string | void> | null
    streamTimer: (() => number) | null
  }
}

export async function create (): Promise<FastifyInstance> {
  const platformatic = getGlobal<{ applicationConfig: ReginaAgentConfiguration }>()
  const app = fastify({
    loggerInstance: platformatic?.logger?.child({}, { level: platformatic?.logLevel ?? 'info' }) as FastifyBaseLogger
  })

  const config = platformatic!.applicationConfig.reginaAgent
  if (!config?.definitionPath) {
    throw new Error('reginaAgent.definitionPath is required')
  }

  const removed = sanitizeEnv(config.allowedEnv)
  app.log.debug({ count: removed.length }, 'Sanitized process.env')

  const providerSettings: ProviderSettings = { apiKey: config.apiKey, baseURL: config.baseURL }

  const provider = createProvider(config)
  const useRealFs = config.fsRootPath != null
  const vfs = createVfs(provider, { moduleHooks: false, virtualCwd: useRealFs })
  if (useRealFs) {
    vfs.chdir('/')
  }

  const definition = await loadDefinition(config.definitionPath)
  const defaultTools = createDefaultTools(vfs, useRealFs ? { cwd: '/' } : undefined)
  const userTools = await loadTools(definition.tools)
  let mcpConnection: McpConnection | undefined
  if (definition.mcpServers?.length) {
    mcpConnection = await loadMcpServers(definition.mcpServers, { logger: app.log })
  }
  const tools: Record<string, any> = { ...defaultTools, ...(mcpConnection?.tools ?? {}), ...userTools }

  if (config.coordinatorId && config.instanceId && definition.delegates?.length) {
    tools.delegate = createDelegateTool(config.coordinatorId, config.instanceId, definition.delegates)
  }

  const messages: CoreMessage[] = loadMessages(vfs)

  app.addHook('onClose', async () => {
    if (mcpConnection) {
      await mcpConnection.close()
    }
    if (typeof (provider as any).close === 'function') {
      ;(provider as any).close()
    }
  })
  const metrics = createMetrics()
  const heartbeat =
    config.coordinatorId && config.instanceId ? createHeartbeat(config.coordinatorId, config.instanceId) : undefined

  const onStepFinish = (step: StepResult<ToolSet>) => {
    if (metrics) {
      metrics.stepsTotal.inc({ definition_id: definition.id })
      if (step.toolCalls) {
        for (const tc of step.toolCalls) {
          metrics.toolCallsTotal.inc({ definition_id: definition.id, tool_name: tc.toolName })
        }
      }
      if (step.usage) {
        metrics.tokensTotal.inc({ definition_id: definition.id, type: 'prompt' }, step.usage.promptTokens)
        metrics.tokensTotal.inc({ definition_id: definition.id, type: 'completion' }, step.usage.completionTokens)
      }
    }
    heartbeat?.()
  }

  app.log.info({ agent: definition.name, model: definition.model }, 'Agent loaded')

  const steeringQueue: string[] = []

  let persistedLength = messages.length

  function persistMessages () {
    if (messages.length === persistedLength + 2) {
      appendMessages(vfs, messages[messages.length - 2], messages[messages.length - 1])
    } else if (messages.length !== persistedLength) {
      rewriteMessages(vfs, messages)
    }
    persistedLength = messages.length
  }

  app.decorateRequest('streamDone', null)
  app.decorateRequest('streamTimer', null)

  app.addHook('onResponse', async request => {
    if (request.streamDone) {
      await request.streamDone
    }
    if (request.streamTimer) {
      ;(request.streamTimer as () => number)()
    }
    persistMessages()
  })

  app.post(
    '/steer',
    {
      schema: {
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
    },
    async request => {
      const { message } = request.body as { message: string }
      steeringQueue.push(message)
      metrics?.steeringMessagesTotal.inc({ definition_id: definition.id })
      return { queued: true }
    }
  )

  app.post(
    '/chat',
    {
      schema: {
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
    },
    async request => {
      const { message } = request.body as { message: string }
      metrics?.chatRequestsTotal.inc({ definition_id: definition.id, type: 'sync' })
      const stopTimer = metrics?.chatDuration.startTimer({ definition_id: definition.id, type: 'sync' })
      const result = await handleChat({
        message,
        messages,
        definition,
        tools,
        providerSettings,
        onStepFinish,
        steeringQueue,
        delegateAgents: config.delegateAgents
      })
      stopTimer?.()
      return result
    }
  )

  app.post(
    '/chat/stream',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      }
    },
    async (request, reply) => {
      const { message } = request.body as { message: string }
      metrics?.chatRequestsTotal.inc({ definition_id: definition.id, type: 'stream' })
      request.streamTimer = metrics?.chatDuration.startTimer({ definition_id: definition.id, type: 'stream' }) ?? null
      const { result } = await handleStreamChat({
        message,
        messages,
        definition,
        tools,
        providerSettings,
        onStepFinish,
        steeringQueue,
        delegateAgents: config.delegateAgents
      })

      request.streamDone = result.text.catch(() => {})

      const ndjsonStream = Readable.from(
        // eslint-disable-next-line @stylistic/generator-star-spacing
        (async function* () {
          for await (const part of result.fullStream) {
            if (part.type === 'error') {
              const err = part.error as Error
              yield JSON.stringify({ type: 'text-delta', textDelta: `\nError: ${err.message}` }) + '\n'
            } else {
              yield JSON.stringify(part) + '\n'
            }
          }
        })()
      )

      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Cache-Control', 'no-cache')
      reply.header('Connection', 'keep-alive')

      return reply.send(ndjsonStream)
    }
  )

  app.get(
    '/messages',
    {
      schema: {
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
    },
    async () => {
      return messages
    }
  )

  return app
}
