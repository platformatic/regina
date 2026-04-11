import { schema as serviceSchema } from '@platformatic/service'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf-8'))
export const version: string = packageJson.version

export const regina = {
  type: 'object',
  properties: {
    agentsDir: { type: 'string', default: './agents' },
    vfsDir: { type: 'string', default: './vfs' },
    idleTimeout: { type: 'integer', default: 300 },
    defaults: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        maxSteps: { type: 'integer', default: 10 }
      },
      additionalProperties: false
    },
    redis: { type: 'string' },
    memberAddress: { type: 'string' },
    memberId: { type: 'string' },
    useProcesses: { type: 'boolean', default: false },
    storage: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['fs', 's3', 'redis'] },
        basePath: { type: 'string' },
        bucket: { type: 'string' },
        prefix: { type: 'string' },
        endpoint: { type: 'string' },
        region: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
} as const

export const schemaComponents = {
  regina
}

export const schema: typeof serviceSchema = structuredClone(serviceSchema)

schema.$id = `https://schemas.platformatic.dev/@platformatic/regina/${packageJson.version}.json`
schema.title = 'Platformatic Regina configuration'
schema.version = packageJson.version
;(schema.properties as Record<string, unknown>).regina = regina
delete (schema.properties as Record<string, unknown>).migrations
delete (schema.properties as Record<string, unknown>).types
