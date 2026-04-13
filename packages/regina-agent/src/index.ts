import { kMetadata, type RawConfiguration } from '@platformatic/foundation'
import { loadConfiguration, NodeCapability, type NodeConfiguration, transform } from '@platformatic/node'
import { resolve } from 'node:path'
import { type ReginaAgentConfiguration, schema } from './schema.ts'

export class ReginaAgentCapability extends NodeCapability {
  declare config: ReginaAgentConfiguration

  constructor (root: string, config: ReginaAgentConfiguration, context?: object) {
    super(root, config, context)

    this.registerGlobals({ applicationConfig: this.config })
  }

  async getChildManagerContext (basePath: string) {
    const context = (await super.getChildManagerContext(basePath)) as { applicationConfig: ReginaAgentConfiguration }

    context.applicationConfig = this.config

    return context
  }

  async start ({ listen }: { listen: boolean }) {
    if (this.url) {
      return this.url
    }

    if (this.config.reginaAgent.useProcesses) {
      return this.startWithCommand(`${process.argv[0]} ${resolve(import.meta.dirname, './standalone.js')}`)
    }

    return super.start({ listen })
  }

  async stop () {
    if (this.config.reginaAgent.useProcesses) {
      return this.stopCommand()
    }

    return super.stop()
  }
}

export async function create (
  configOrRoot: string | RawConfiguration,
  sourceOrConfig: string | RawConfiguration,
  context?: object
) {
  const config = await loadConfiguration(configOrRoot, sourceOrConfig, {
    ...context,
    schema,
    async transform (config: NodeConfiguration, ...args: any[]) {
      config = await transform(config, ...args)
      config.application ??= {}
      config.application.commands = {}
      config.node ??= {}
      config.node.main = resolve(import.meta.dirname, './server.js')
      return config
    }
  })

  return new ReginaAgentCapability(config[kMetadata].root, config as ReginaAgentConfiguration, context)
}

export * from './schema.ts'
