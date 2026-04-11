import { strictEqual, ok } from 'node:assert'
import test from 'node:test'
import { create, regina, Generator, schema, packageJson, version, schemaComponents } from '../src/index.ts'

test('index - exports create function', () => {
  strictEqual(typeof create, 'function')
})

test('index - exports regina application factory', () => {
  strictEqual(typeof regina, 'function')
})

test('index - exports Generator class', () => {
  strictEqual(typeof Generator, 'function')
  const gen = new Generator()
  ok(gen, 'should instantiate Generator')
})

test('index - exports schema', () => {
  ok(schema, 'should export schema')
  ok(schema.$id, 'schema should have $id')
})

test('index - exports packageJson', () => {
  strictEqual(packageJson.name, '@platformatic/regina')
})

test('index - exports version', () => {
  strictEqual(typeof version, 'string')
  ok(version.match(/^\d+\.\d+\.\d+$/))
})

test('index - exports schemaComponents', () => {
  ok(schemaComponents, 'should export schemaComponents')
  ok(schemaComponents.regina, 'should include regina component')
})
