import { strictEqual } from 'node:assert'
import test from 'node:test'
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici'
import { createHeartbeat } from '../src/heartbeat.ts'

test('createHeartbeat - returns a function', () => {
  const heartbeat = createHeartbeat('coord-1', 'inst-123')
  strictEqual(typeof heartbeat, 'function')
})

test('createHeartbeat - sends POST to correct .plt.local URL', async (t) => {
  const originalDispatcher = getGlobalDispatcher()
  const mockAgent = new MockAgent({ enableCallHistory: true })
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  const mockPool = mockAgent.get('http://coord-1.plt.local')
  mockPool.intercept({ path: '/instances/inst-123/heartbeat', method: 'POST' }).reply(204)

  const heartbeat = createHeartbeat('coord-1', 'inst-123')
  heartbeat()

  // fetch is fire-and-forget, give the promise a tick to settle
  await new Promise(resolve => setImmediate(resolve))

  const history = mockAgent.getCallHistory()
  const call = history?.firstCall()
  strictEqual(call?.method, 'POST')
  strictEqual(call?.origin, 'http://coord-1.plt.local')
  strictEqual(call?.path, '/instances/inst-123/heartbeat')
})

test('createHeartbeat - swallows network errors silently', async (t) => {
  const originalDispatcher = getGlobalDispatcher()
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // No intercept registered — request will be rejected by disableNetConnect
  const heartbeat = createHeartbeat('coord-1', 'inst-456')
  heartbeat() // should not throw
  await new Promise(resolve => setImmediate(resolve))
})
