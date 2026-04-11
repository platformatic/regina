import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import test from 'node:test'
import { packageJson, reginaAgent, schema, schemaComponents, version } from '../src/schema.ts'

test('schema - exports version from package.json', () => {
  strictEqual(version, packageJson.version)
})

test('schema - has correct $id and title', () => {
  strictEqual(schema.$id, `https://schemas.platformatic.dev/@platformatic/regina-agent/${version}.json`)
  strictEqual(schema.title, 'Platformatic Regina Agent configuration')
  strictEqual(schema.version, version)
})

test('schema - includes reginaAgent property', () => {
  const props = schema.properties as Record<string, unknown>
  ok(props.reginaAgent, 'schema should have reginaAgent property')
  strictEqual(typeof props.reginaAgent, 'object')
})

test('schema - removes migrations and types from service schema', () => {
  const props = schema.properties as Record<string, unknown>
  strictEqual(props.migrations, undefined)
  strictEqual(props.types, undefined)
})

test('schema - retains node capability properties', () => {
  const props = schema.properties as Record<string, unknown>
  ok(props.server, 'schema should retain server property')
})

test('schema - reginaAgent config shape', () => {
  deepStrictEqual(reginaAgent, {
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
  })
})

test('schema - schemaComponents exports reginaAgent', () => {
  strictEqual(schemaComponents.reginaAgent, reginaAgent)
})

test('schema - packageJson has correct name', () => {
  strictEqual(packageJson.name, '@platformatic/regina-agent')
})
