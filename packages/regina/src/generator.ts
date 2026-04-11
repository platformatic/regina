import { Generator as ServiceGenerator } from '@platformatic/service'
import { packageJson } from './schema.ts'

class ReginaGenerator extends ServiceGenerator {
  getDefaultConfig (): Record<string, any> {
    const defaultBaseConfig = super.getDefaultConfig()
    const defaultConfig = {
      regina: {
        agentsDir: './agents',
        defaults: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          maxSteps: 10
        }
      }
    }
    return Object.assign({}, defaultBaseConfig, defaultConfig, {
      skipTypescript: true,
      tests: false,
      plugin: false
    })
  }

  getConfigFieldsDefinitions (): ReturnType<typeof ServiceGenerator.prototype.getConfigFieldsDefinitions> {
    const serviceConfigFieldsDefs = super.getConfigFieldsDefinitions()
    return [
      ...serviceConfigFieldsDefs,
      {
        var: 'PLT_REGINA_AGENTS_DIR',
        label: 'Agents directory',
        default: './agents',
        type: 'string' as const
      },
      {
        var: 'PLT_REGINA_REDIS',
        label: 'Redis/Valkey connection URL (optional, enables multi-pod)',
        default: '',
        type: 'string' as const
      },
      {
        var: 'PLT_REGINA_MEMBER_ADDRESS',
        label: 'This pod\'s routable address (optional, e.g. from POD_IP)',
        default: '',
        type: 'string' as const
      },
      {
        var: 'PLT_REGINA_MEMBER_ID',
        label: 'Unique pod identifier (optional, e.g. hostname)',
        default: '',
        type: 'string' as const
      },
      {
        var: 'PLT_REGINA_STORAGE_TYPE',
        label: 'Storage adapter type (optional: fs, s3, redis)',
        default: '',
        type: 'string' as const
      }
    ]
  }

  async _getConfigFileContents (): Promise<Record<string, any>> {
    const baseConfig = await super._getConfigFileContents()

    const reginaConfig: Record<string, any> = {
      agentsDir: `{${this.getEnvVarName('PLT_REGINA_AGENTS_DIR')}}`
    }

    if (this.config.regina?.redis) {
      reginaConfig.redis = `{${this.getEnvVarName('PLT_REGINA_REDIS')}}`
      reginaConfig.memberAddress = `{${this.getEnvVarName('PLT_REGINA_MEMBER_ADDRESS')}}`
      reginaConfig.memberId = `{${this.getEnvVarName('PLT_REGINA_MEMBER_ID')}}`
    }

    if (this.config.regina?.storage?.type) {
      reginaConfig.storage = {
        type: `{${this.getEnvVarName('PLT_REGINA_STORAGE_TYPE')}}`
      }
    }

    const config = {
      $schema: `https://schemas.platformatic.dev/@platformatic/regina/${packageJson.version}.json`,
      module: packageJson.name,
      regina: reginaConfig
    }
    return Object.assign({}, baseConfig, config)
  }

  async _beforePrepare () {
    super._beforePrepare()

    const envVars: Record<string, string> = {
      PLT_REGINA_AGENTS_DIR: this.config.regina?.agentsDir ?? './agents'
    }

    if (this.config.regina?.redis) {
      envVars.PLT_REGINA_REDIS = this.config.regina.redis
      envVars.PLT_REGINA_MEMBER_ADDRESS = this.config.regina.memberAddress ?? ''
      envVars.PLT_REGINA_MEMBER_ID = this.config.regina.memberId ?? ''
    }

    if (this.config.regina?.storage?.type) {
      envVars.PLT_REGINA_STORAGE_TYPE = this.config.regina.storage.type
    }

    this.addEnvVars(envVars, { overwrite: false })

    this.config.dependencies = {
      [packageJson.name]: `^${packageJson.version}`
    }
  }
}

export default ReginaGenerator
export const Generator = ReginaGenerator
