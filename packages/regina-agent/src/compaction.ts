import { generateText, type CoreMessage, type LanguageModel } from 'ai'

export function estimateTokens (messages: CoreMessage[]): number {
  let totalChars = 0
  for (const message of messages) {
    if (typeof message.content === 'string') {
      totalChars += message.content.length
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          totalChars += part.text.length
        } else {
          totalChars += JSON.stringify(part).length
        }
      }
    }
  }
  return Math.ceil(totalChars / 4)
}

export interface CompactOptions {
  threshold?: number
  keepLastN?: number
}

export async function compactMessages (
  messages: CoreMessage[],
  model: LanguageModel,
  options?: CompactOptions
): Promise<boolean> {
  const threshold = options?.threshold ?? 100_000
  const keepLastN = options?.keepLastN ?? 10

  if (estimateTokens(messages) <= threshold) {
    return false
  }

  const splitIndex = messages.length - keepLastN
  if (splitIndex <= 0) {
    return false
  }

  const toSummarize = messages.slice(0, splitIndex)
  const toKeep = messages.slice(splitIndex)

  const result = await generateText({
    model,
    messages: [
      ...toSummarize,
      {
        role: 'user',
        content: 'Summarize the conversation above in a concise paragraph, preserving key facts, decisions, and context needed to continue the conversation.'
      }
    ]
  })

  const summaryUser: CoreMessage = {
    role: 'user',
    content: `[Previous conversation summary]\n${result.text}`
  }
  const summaryAck: CoreMessage = {
    role: 'assistant',
    content: 'Understood, I have the context from our previous conversation.'
  }

  messages.length = 0
  messages.push(summaryUser, summaryAck, ...toKeep)

  return true
}
