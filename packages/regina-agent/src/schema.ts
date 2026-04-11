import { type NodeConfiguration, schema as nodeSchema } from '@platformatic/node'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf-8'))
export const version: string = packageJson.version

export interface ReginaAgentConfiguration extends NodeConfiguration {
  reginaAgent: {
    definitionPath: string
    toolsBasePath?: string
    vfsDbPath?: string
    coordinatorId?: string
    instanceId?: string
    apiKey?: string
    baseURL?: string
    allowedEnv?: string[]
    useProcesses?: boolean
  }
}

export const reginaAgent = {
  type: 'object',
  properties: {
    definitionPath: { type: 'string' },
    toolsBasePath: { type: 'string' },
    vfsDbPath: { type: 'string' },
    coordinatorId: { type: 'string' },
    instanceId: { type: 'string' },
    apiKey: { type: 'string' },
    baseURL: { type: 'string' },
    allowedEnv: { type: 'array', items: { type: 'string' } },
    useProcesses: { type: 'boolean', default: false }
  },
  required: ['definitionPath'],
  additionalProperties: false
} as const

export const schemaComponents = {
  reginaAgent
}

export const schema: typeof nodeSchema = structuredClone(nodeSchema)

schema.$id = `https://schemas.platformatic.dev/@platformatic/regina-agent/${packageJson.version}.json`
schema.title = 'Platformatic Regina Agent configuration'
schema.version = packageJson.version
schema.properties.reginaAgent = reginaAgent
