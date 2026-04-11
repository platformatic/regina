import { tool } from 'ai'
import { z } from 'zod'
import type { CoreTool } from 'ai'

export function createDelegateTool (
  coordinatorId: string,
  instanceId: string,
  allowedAgentTypes: string[]
): CoreTool {
  const url = `http://${coordinatorId}.plt.local/delegate`

  return tool({
    description: `Delegate a subtask to a specialized agent. Available agents: ${allowedAgentTypes.join(', ')}`,
    parameters: z.object({
      agentType: z.enum(allowedAgentTypes as [string, ...string[]]).describe('The type of agent to delegate to'),
      message: z.string().describe('The message/task to send to the delegate agent')
    }),
    execute: async ({ agentType, message }) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentType, message, callerInstanceId: instanceId }),
          signal: AbortSignal.timeout(300_000)
        })

        if (!res.ok) {
          const text = await res.text()
          return { error: `Delegation failed (${res.status}): ${text}` }
        }

        const result = await res.json() as { text: string }
        return { response: result.text }
      } catch (err: any) {
        return { error: `Delegation failed: ${err.message}` }
      }
    }
  })
}
