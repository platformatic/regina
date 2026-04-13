import { create as createService, platformaticService } from '@platformatic/service'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { plugin } from './plugin.ts'
import { schema } from './schema.ts'

export async function regina (app: FastifyInstance, capability: any) {
  await platformaticService(app, capability)
  await app.register(plugin, capability)
}

export async function create (configOrRoot: any, sourceOrConfig?: any, context?: any) {
  return createService(configOrRoot, sourceOrConfig, { schema, applicationFactory: fp(regina), ...context })
}

export * from './agent-discovery.ts'
export * from './generator.ts'
export * from './instance-manager.ts'
export * from './plugin.ts'
export * from './schema.ts'
export * from './state-backup.ts'
