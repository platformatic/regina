import { strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { create, ReginaAgentCapability, schema, packageJson, version, schemaComponents } from '../src/index.ts'

test('index - exports create function', () => {
  strictEqual(typeof create, 'function')
})

test('index - exports ReginaAgentCapability class', () => {
  strictEqual(typeof ReginaAgentCapability, 'function')
})

test('index - exports schema', () => {
  ok(schema, 'should export schema')
  ok(schema.$id, 'schema should have $id')
})

test('index - exports packageJson', () => {
  strictEqual(packageJson.name, '@platformatic/regina-agent')
})

test('index - exports version', () => {
  strictEqual(typeof version, 'string')
  ok(version.match(/^\d+\.\d+\.\d+$/))
})

test('index - exports schemaComponents', () => {
  ok(schemaComponents, 'should export schemaComponents')
  ok(schemaComponents.reginaAgent, 'should include reginaAgent component')
})
