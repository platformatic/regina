import { deepStrictEqual, strictEqual } from 'node:assert'
import { after, before, test } from 'node:test'
import Redis from 'iovalkey'
import { RedisAdapter } from '../src/redis-adapter.ts'

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
const hashKey = `regina:test:${Date.now()}`
let client: Redis
let adapter: RedisAdapter

before(async () => {
  client = new Redis(redisUrl)
  adapter = new RedisAdapter({ client, hashKey })
})

after(async () => {
  await client.del(hashKey)
  await client.quit()
})

test('put and get roundtrip', async () => {
  const data = Buffer.from('redis state')
  await adapter.put('key-1', data)
  const result = await adapter.get('key-1')
  deepStrictEqual(result, data)
})

test('get missing key returns null', async () => {
  const result = await adapter.get('nonexistent')
  strictEqual(result, null)
})

test('delete removes a key', async () => {
  const data = Buffer.from('to delete')
  await adapter.put('del-key', data)
  await adapter.delete('del-key')
  const result = await adapter.get('del-key')
  strictEqual(result, null)
})

test('list filters by prefix', async () => {
  await adapter.put('svc-alpha', Buffer.from('a'))
  await adapter.put('svc-beta', Buffer.from('b'))
  await adapter.put('other', Buffer.from('c'))

  const result = await adapter.list('svc-')
  deepStrictEqual(result.sort(), ['svc-alpha', 'svc-beta'])
})

test('list returns empty for no matches', async () => {
  const result = await adapter.list('zzz-')
  deepStrictEqual(result, [])
})
