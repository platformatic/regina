import { create as createService, platformaticService } from '@platformatic/service'
import fp from 'fastify-plugin'
import { plugin } from './plugin.ts'
import { schema } from './schema.ts'
import type { FastifyInstance } from 'fastify'

export async function regina (app: FastifyInstance, capability: any) {
  await platformaticService(app, capability)
  await app.register(plugin, capability)
}

export async function create (configOrRoot: any, sourceOrConfig?: any, context?: any) {
  return createService(configOrRoot, sourceOrConfig, { schema, applicationFactory: fp(regina), ...context })
}

export { Generator } from './generator.ts'
export { packageJson, schema, schemaComponents, version } from './schema.ts'
