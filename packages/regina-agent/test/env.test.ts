import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import test from 'node:test'
import { sanitizeEnv } from '../src/env.ts'

function withCleanEnv (fn: () => void) {
  const saved = { ...process.env }
  try {
    // Clear everything, then set only test keys
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    fn()
  } finally {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, saved)
  }
}

test('sanitizeEnv - keeps allowed exact keys', () => {
  withCleanEnv(() => {
    process.env.NODE_ENV = 'test'
    process.env.PATH = '/usr/bin'
    process.env.HOME = '/home/user'
    process.env.SECRET_KEY = 'should-be-removed'

    const removed = sanitizeEnv()

    strictEqual(process.env.NODE_ENV, 'test')
    strictEqual(process.env.PATH, '/usr/bin')
    strictEqual(process.env.HOME, '/home/user')
    strictEqual(process.env.SECRET_KEY, undefined)
    deepStrictEqual(removed, ['SECRET_KEY'])
  })
})

test('sanitizeEnv - keeps PLT_ prefix keys', () => {
  withCleanEnv(() => {
    process.env.PLT_SERVER_HOSTNAME = 'localhost'
    process.env.PLT_SOMETHING = 'value'
    process.env.DATABASE_URL = 'postgres://...'

    const removed = sanitizeEnv()

    strictEqual(process.env.PLT_SERVER_HOSTNAME, 'localhost')
    strictEqual(process.env.PLT_SOMETHING, 'value')
    strictEqual(process.env.DATABASE_URL, undefined)
    deepStrictEqual(removed, ['DATABASE_URL'])
  })
})

test('sanitizeEnv - removes unknown keys', () => {
  withCleanEnv(() => {
    process.env.NODE_ENV = 'production'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx'
    process.env.OPENAI_API_KEY = 'sk-xxx'
    process.env.DATABASE_URL = 'postgres://...'
    process.env.REDIS_URL = 'redis://...'

    const removed = sanitizeEnv()

    strictEqual(process.env.NODE_ENV, 'production')
    strictEqual(process.env.ANTHROPIC_API_KEY, undefined)
    strictEqual(process.env.OPENAI_API_KEY, undefined)
    strictEqual(process.env.DATABASE_URL, undefined)
    strictEqual(process.env.REDIS_URL, undefined)
    strictEqual(removed.length, 4)
    ok(removed.includes('ANTHROPIC_API_KEY'))
    ok(removed.includes('OPENAI_API_KEY'))
  })
})

test('sanitizeEnv - supports extra exact names via allowedEnv', () => {
  withCleanEnv(() => {
    process.env.NODE_ENV = 'test'
    process.env.MY_CUSTOM_VAR = 'hello'
    process.env.OTHER_VAR = 'bye'

    const removed = sanitizeEnv(['MY_CUSTOM_VAR'])

    strictEqual(process.env.MY_CUSTOM_VAR, 'hello')
    strictEqual(process.env.OTHER_VAR, undefined)
    deepStrictEqual(removed, ['OTHER_VAR'])
  })
})

test('sanitizeEnv - supports extra prefix patterns', () => {
  withCleanEnv(() => {
    process.env.NODE_ENV = 'test'
    process.env.CUSTOM_FOO = 'a'
    process.env.CUSTOM_BAR = 'b'
    process.env.OTHER_VAR = 'c'

    const removed = sanitizeEnv(['CUSTOM_*'])

    strictEqual(process.env.CUSTOM_FOO, 'a')
    strictEqual(process.env.CUSTOM_BAR, 'b')
    strictEqual(process.env.OTHER_VAR, undefined)
    deepStrictEqual(removed, ['OTHER_VAR'])
  })
})

test('sanitizeEnv - returns list of removed keys', () => {
  withCleanEnv(() => {
    process.env.NODE_ENV = 'test'
    process.env.A = '1'
    process.env.B = '2'
    process.env.C = '3'

    const removed = sanitizeEnv()

    strictEqual(removed.length, 3)
    ok(removed.includes('A'))
    ok(removed.includes('B'))
    ok(removed.includes('C'))
  })
})

test('sanitizeEnv - keeps all default allowlist keys', () => {
  withCleanEnv(() => {
    const allowedKeys = ['NODE_ENV', 'HOME', 'PATH', 'SHELL', 'USER', 'LANG', 'TMPDIR', 'TMP', 'TEMP']
    for (const key of allowedKeys) {
      process.env[key] = 'test-value'
    }
    process.env.SHOULD_REMOVE = 'yes'

    const removed = sanitizeEnv()

    for (const key of allowedKeys) {
      strictEqual(process.env[key], 'test-value', `${key} should be kept`)
    }
    deepStrictEqual(removed, ['SHOULD_REMOVE'])
  })
})
