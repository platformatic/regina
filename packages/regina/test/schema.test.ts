import { deepStrictEqual, strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { schema, schemaComponents, version, packageJson, regina } from '../src/schema.ts'

test('schema - exports version from package.json', () => {
  strictEqual(version, packageJson.version)
})

test('schema - has correct $id and title', () => {
  strictEqual(schema.$id, `https://schemas.platformatic.dev/@platformatic/regina/${version}.json`)
  strictEqual(schema.title, 'Platformatic Regina configuration')
  strictEqual(schema.version, version)
})

test('schema - includes regina property', () => {
  const props = schema.properties as Record<string, unknown>
  ok(props.regina, 'schema should have regina property')
  strictEqual(typeof props.regina, 'object')
})

test('schema - removes migrations and types from service schema', () => {
  const props = schema.properties as Record<string, unknown>
  strictEqual(props.migrations, undefined)
  strictEqual(props.types, undefined)
})

test('schema - retains service properties', () => {
  const props = schema.properties as Record<string, unknown>
  ok(props.server, 'schema should retain server property')
  ok(props.service, 'schema should retain service property')
})

test('schema - regina config shape', () => {
  deepStrictEqual(regina, {
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
  })
})

test('schema - schemaComponents exports regina', () => {
  strictEqual(schemaComponents.regina, regina)
})

test('schema - packageJson has correct name', () => {
  strictEqual(packageJson.name, '@platformatic/regina')
})
