import { generateText, streamText, type CoreMessage, type CoreTool, type LanguageModel, type StepResult, type ToolSet } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { AgentDefinition } from './definition-loader.ts'
import type { DelegateAgentMetadata } from './schema.ts'
import { compactMessages } from './compaction.ts'

export interface ProviderSettings {
  apiKey?: string
  baseURL?: string
}

const VERCEL_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1'

export function resolveProvider (definition: AgentDefinition, settings?: ProviderSettings): LanguageModel {
  const provider = definition.provider ?? inferProvider(definition.model)

  switch (provider) {
    case 'anthropic':
      return createAnthropic({
        apiKey: settings?.apiKey,
        baseURL: settings?.baseURL
      })(definition.model)
    case 'openai':
      return createOpenAI({
        apiKey: settings?.apiKey,
        baseURL: settings?.baseURL
      })(definition.model)
    case 'vercel-gateway':
      return createOpenAI({
        apiKey: settings?.apiKey,
        baseURL: settings?.baseURL ?? VERCEL_GATEWAY_BASE_URL
      })(definition.model)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

function inferProvider (model: string): string {
  if (model.includes('/')) {
    return 'vercel-gateway'
  }
  if (model.startsWith('claude') || model.startsWith('anthropic')) {
    return 'anthropic'
  }
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
    return 'openai'
  }
  throw new Error(`Cannot infer provider for model: ${model}. Please specify a provider.`)
}

export interface ChatResult {
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

export interface ChatOptions {
  message: string
  messages: CoreMessage[]
  definition: AgentDefinition
  tools: Record<string, CoreTool>
  model?: LanguageModel
  providerSettings?: ProviderSettings
  onStepFinish?: (step: StepResult<ToolSet>) => void
  steeringQueue?: string[]
  delegateAgents?: DelegateAgentMetadata[]
}

export function buildSystemPrompt (
  definition: AgentDefinition,
  tools: Record<string, CoreTool>,
  delegateAgents?: DelegateAgentMetadata[]
): string {
  const sections = [definition.systemPrompt]

  if (definition.delegates?.length && tools.delegate) {
    const delegateSummary = delegateAgents?.length
      ? delegateAgents.map((agent) => {
        const details = [
          `- ${agent.id}`,
          agent.name !== agent.id ? `name: ${agent.name}` : undefined,
          agent.description ? `description: ${agent.description}` : undefined,
          agent.greeting ? `greeting: ${agent.greeting}` : undefined
        ].filter(Boolean).join('; ')

        return details
      }).join('\n')
      : definition.delegates.map(id => `- ${id}`).join('\n')

    sections.push([
      '## Runtime capabilities',
      'You can communicate with other agents over the internal mesh network by using the `delegate` tool.',
      `Allowed agent types: ${definition.delegates.join(', ')}.`,
      'When a task would benefit from a specialist, more bandwidth, or a fresh sub-agent, call `delegate` instead of saying you cannot do that.',
      'The platform will find or spawn the target agent instance for you automatically.',
      'When delegating, send a self-contained message with the goal, relevant context, constraints, and the exact output you want back.',
      '',
      'Available delegate agents:',
      delegateSummary
    ].join('\n'))
  }

  return sections.join('\n\n')
}

export async function handleChat (options: ChatOptions): Promise<ChatResult> {
  const { message, messages, definition, tools, onStepFinish, steeringQueue, delegateAgents } = options
  messages.push({ role: 'user', content: message })

  const model = options.model ?? resolveProvider(definition, options.providerSettings)
  const systemPrompt = buildSystemPrompt(definition, tools, delegateAgents)

  await compactMessages(messages, model)

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: definition.maxSteps ?? 10,
      onStepFinish: (step) => {
        if (steeringQueue) {
          while (steeringQueue.length > 0) {
            messages.push({ role: 'user', content: steeringQueue.shift()! })
          }
        }
        onStepFinish?.(step)
      }
    })

    if (result.text) {
      messages.push({ role: 'assistant', content: result.text })
    }

    return {
      text: result.text,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens
          }
        : undefined
    }
  } catch (err: any) {
    const errorText = `Error: ${err.message}`
    messages.push({ role: 'assistant', content: errorText })
    return { text: errorText }
  }
}

export async function handleStreamChat (options: ChatOptions) {
  const { message, messages, definition, tools, onStepFinish, steeringQueue, delegateAgents } = options
  messages.push({ role: 'user', content: message })

  const model = options.model ?? resolveProvider(definition, options.providerSettings)
  const systemPrompt = buildSystemPrompt(definition, tools, delegateAgents)

  await compactMessages(messages, model)

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: definition.maxSteps ?? 10,
    onStepFinish: (step) => {
      if (steeringQueue) {
        while (steeringQueue.length > 0) {
          messages.push({ role: 'user', content: steeringQueue.shift()! })
        }
      }
      onStepFinish?.(step)
    },
    onFinish ({ text }) {
      if (text) {
        messages.push({ role: 'assistant', content: text })
      }
    },
    onError ({ error }) {
      const errorText = `Error: ${(error as Error).message}`
      messages.push({ role: 'assistant', content: errorText })
    }
  })

  return { result }
}
