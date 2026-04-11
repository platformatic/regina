import { dirname } from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { Bash } from 'just-bash'
import type { CoreTool } from 'ai'
import type { VirtualFileSystem } from '@platformatic/vfs'
import { VfsAdapter } from './vfs-adapter.ts'

export function createDefaultTools (vfs: VirtualFileSystem): Record<string, CoreTool> {
  const vfsAdapter = new VfsAdapter(vfs)
  const bash = new Bash({ fs: vfsAdapter })

  return {
    bash: tool({
      description: 'Execute a bash command. Use for running scripts, processing data, searching files, and system operations.',
      parameters: z.object({
        command: z.string().describe('The bash command to execute')
      }),
      execute: async ({ command }) => {
        const result = await bash.exec(command)
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
      }
    }),

    read_file: tool({
      description: 'Read the contents of a file at the given path.',
      parameters: z.object({
        path: z.string().describe('Absolute path to the file to read')
      }),
      execute: async ({ path }) => {
        const content = vfs.readFileSync(path, 'utf-8')
        return { content }
      }
    }),

    write_file: tool({
      description: 'Write content to a file at the given path, creating it if it does not exist.',
      parameters: z.object({
        path: z.string().describe('Absolute path to the file to write'),
        content: z.string().describe('The content to write')
      }),
      execute: async ({ path, content }) => {
        vfs.mkdirSync(dirname(path), { recursive: true })
        vfs.writeFileSync(path, content)
        return { success: true }
      }
    }),

    edit_file: tool({
      description: 'Replace a specific substring in a file. The old_string must match exactly once. Use read_file first to see current content.',
      parameters: z.object({
        path: z.string().describe('Absolute path to the file to edit'),
        old_string: z.string().describe('The exact text to find and replace (must be unique in the file)'),
        new_string: z.string().describe('The replacement text')
      }),
      execute: async ({ path, old_string: oldString, new_string: newString }) => {
        const content = vfs.readFileSync(path, 'utf-8')
        const count = content.split(oldString).length - 1
        if (count === 0) {
          return { error: 'old_string not found in file' }
        }
        if (count > 1) {
          return { error: `old_string is not unique — found ${count} occurrences. Provide more surrounding context.` }
        }
        vfs.writeFileSync(path, content.replace(oldString, newString))
        return { success: true }
      }
    })
  }
}
