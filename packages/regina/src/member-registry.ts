import type { Redis } from 'iovalkey'

const MEMBER_TTL = 30
const MEMBERS_KEY = 'regina:members'

function memberKey (memberId: string): string {
  return `regina:member:${memberId}`
}

function instanceKey (instanceId: string): string {
  return `regina:instance:${instanceId}`
}

function instanceCountKey (memberId: string): string {
  return `regina:member:${memberId}:instances`
}

export class MemberRegistry {
  #redis: Redis
  #memberAddress: string
  #memberId: string

  constructor (redis: Redis, memberAddress: string, memberId: string) {
    this.#redis = redis
    this.#memberAddress = memberAddress
    this.#memberId = memberId
  }

  async register (): Promise<void> {
    await this.#redis.sadd(MEMBERS_KEY, this.#memberId)
    await this.#redis.set(memberKey(this.#memberId), this.#memberAddress, 'EX', MEMBER_TTL)
    await this.#redis.set(instanceCountKey(this.#memberId), '0', 'EX', MEMBER_TTL)
  }

  async deregister (): Promise<void> {
    await this.#redis.srem(MEMBERS_KEY, this.#memberId)
    await this.#redis.del(memberKey(this.#memberId), instanceCountKey(this.#memberId))
  }

  async heartbeat (): Promise<void> {
    await this.#redis.expire(memberKey(this.#memberId), MEMBER_TTL)
    await this.#redis.expire(instanceCountKey(this.#memberId), MEMBER_TTL)
  }

  async registerInstance (instanceId: string): Promise<void> {
    await this.#redis.set(instanceKey(instanceId), this.#memberId)
    await this.#redis.incr(instanceCountKey(this.#memberId))
  }

  async deregisterInstance (instanceId: string): Promise<void> {
    await this.#redis.del(instanceKey(instanceId))
    await this.#redis.decr(instanceCountKey(this.#memberId))
  }

  async lookupInstance (instanceId: string): Promise<string | null> {
    const memberId = await this.#redis.get(instanceKey(instanceId))
    if (!memberId) return null
    const address = await this.#redis.get(memberKey(memberId))
    return address
  }
}
