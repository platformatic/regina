import { MemoryProvider, RealFSProvider, SqliteProvider } from '@platformatic/vfs'
import type { ReginaAgentConfiguration } from './schema.ts'

export function createProvider (config: ReginaAgentConfiguration['reginaAgent']) {
  if (config.fsRootPath) {
    return new RealFSProvider(config.fsRootPath)
  }
  if (config.vfsDbPath) {
    return new SqliteProvider(config.vfsDbPath)
  }
  return new MemoryProvider()
}
