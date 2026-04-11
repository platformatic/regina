import getGlobal from '@platformatic/globals'
import { create } from './server.ts'

const server = await create()
const platformatic = getGlobal()!
platformatic.events.on('close', async () => {
  await server.close()
})

await server.listen({
  port: 0,
  listenTextResolver: address => `Agent ${platformatic.applicationId} is listening on ${address}`
})
