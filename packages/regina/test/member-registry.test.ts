import { strictEqual, ok } from 'node:assert'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { Redis } from 'iovalkey'
import { MemberRegistry } from '../src/member-registry.ts'

const PREFIX = `test-${randomBytes(4).toString('hex')}`

function membersKey (): string {
  return 'regina:members'
}

function memberKey (memberId: string): string {
  return `regina:member:${memberId}`
}

function instanceKey (instanceId: string): string {
  return `regina:instance:${instanceId}`
}

function instanceCountKey (memberId: string): string {
  return `regina:member:${memberId}:instances`
}

test('MemberRegistry', async (t) => {
  const redis = new Redis()
  const memberId = `${PREFIX}-member-1`
  const memberAddress = 'http://localhost:3001'
  const registry = new MemberRegistry(redis, memberAddress, memberId)

  t.after(async () => {
    // Cleanup all keys created during tests
    await redis.srem(membersKey(), memberId)
    await redis.del(memberKey(memberId), instanceCountKey(memberId))
    const instanceKeys = [`${PREFIX}-inst-1`, `${PREFIX}-inst-2`].map(instanceKey)
    for (const key of instanceKeys) {
      await redis.del(key)
    }
    await redis.quit()
  })

  await t.test('register adds member to set and sets key with TTL', async () => {
    await registry.register()

    const isMember = await redis.sismember(membersKey(), memberId)
    strictEqual(isMember, 1)

    const address = await redis.get(memberKey(memberId))
    strictEqual(address, memberAddress)

    const ttl = await redis.ttl(memberKey(memberId))
    ok(ttl > 0 && ttl <= 30, `TTL should be between 1 and 30, got ${ttl}`)
  })

  await t.test('deregister removes member from set and deletes key', async () => {
    await registry.register()
    await registry.deregister()

    const isMember = await redis.sismember(membersKey(), memberId)
    strictEqual(isMember, 0)

    const address = await redis.get(memberKey(memberId))
    strictEqual(address, null)
  })

  await t.test('heartbeat refreshes TTL', async () => {
    await registry.register()

    // Wait briefly so TTL decreases slightly
    await new Promise(resolve => setTimeout(resolve, 1100))
    const ttlBefore = await redis.ttl(memberKey(memberId))

    await registry.heartbeat()
    const ttlAfter = await redis.ttl(memberKey(memberId))

    ok(ttlAfter >= ttlBefore, `TTL after heartbeat (${ttlAfter}) should be >= TTL before (${ttlBefore})`)
  })

  await t.test('registerInstance sets instance mapping', async () => {
    const instanceId = `${PREFIX}-inst-1`
    await registry.registerInstance(instanceId)

    const value = await redis.get(instanceKey(instanceId))
    strictEqual(value, memberId)
  })

  await t.test('deregisterInstance removes instance mapping', async () => {
    const instanceId = `${PREFIX}-inst-1`
    await registry.registerInstance(instanceId)
    await registry.deregisterInstance(instanceId)

    const value = await redis.get(instanceKey(instanceId))
    strictEqual(value, null)
  })

  await t.test('lookupInstance returns member address via two-step lookup', async () => {
    await registry.register()
    const instanceId = `${PREFIX}-inst-2`
    await registry.registerInstance(instanceId)

    const address = await registry.lookupInstance(instanceId)
    strictEqual(address, memberAddress)
  })

  await t.test('lookupInstance returns null for unknown instance', async () => {
    const address = await registry.lookupInstance('nonexistent-instance')
    strictEqual(address, null)
  })

  await t.test('register initializes instance count to 0', async () => {
    await registry.register()
    const count = await redis.get(instanceCountKey(memberId))
    strictEqual(count, '0')

    const ttl = await redis.ttl(instanceCountKey(memberId))
    ok(ttl > 0 && ttl <= 30, `instance count TTL should be between 1 and 30, got ${ttl}`)
  })

  await t.test('registerInstance increments instance count', async () => {
    await registry.registerInstance(`${PREFIX}-count-1`)
    await registry.registerInstance(`${PREFIX}-count-2`)

    const count = await redis.get(instanceCountKey(memberId))
    strictEqual(count, '2')

    // Cleanup
    await redis.del(instanceKey(`${PREFIX}-count-1`), instanceKey(`${PREFIX}-count-2`))
  })

  await t.test('deregisterInstance decrements instance count', async () => {
    const countBefore = parseInt(await redis.get(instanceCountKey(memberId)) ?? '0', 10)
    await registry.registerInstance(`${PREFIX}-count-3`)
    await registry.deregisterInstance(`${PREFIX}-count-3`)

    const countAfter = parseInt(await redis.get(instanceCountKey(memberId)) ?? '0', 10)
    strictEqual(countAfter, countBefore)
  })

  await t.test('deregister removes instance count key', async () => {
    await registry.deregister()

    const count = await redis.get(instanceCountKey(memberId))
    strictEqual(count, null)
  })

  await t.test('heartbeat refreshes instance count TTL', async () => {
    await registry.register()

    await new Promise(resolve => setTimeout(resolve, 1100))
    const ttlBefore = await redis.ttl(instanceCountKey(memberId))

    await registry.heartbeat()
    const ttlAfter = await redis.ttl(instanceCountKey(memberId))

    ok(ttlAfter >= ttlBefore, `count TTL after heartbeat (${ttlAfter}) should be >= TTL before (${ttlBefore})`)
  })
})
