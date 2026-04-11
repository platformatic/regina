import type { CoreMessage } from 'ai'
import type { VirtualFileSystem } from '@platformatic/vfs'

const SESSION_DIR = '/.session'
const MESSAGES_PATH = `${SESSION_DIR}/messages.jsonl`

export function loadMessages (vfs: VirtualFileSystem): CoreMessage[] {
  try {
    const content = vfs.readFileSync(MESSAGES_PATH, 'utf-8')
    const lines = content.split('\n').filter(line => line.length > 0)
    return lines.map(line => JSON.parse(line))
  } catch {
    return []
  }
}

export function appendMessages (vfs: VirtualFileSystem, ...newMessages: CoreMessage[]): void {
  vfs.mkdirSync(SESSION_DIR, { recursive: true })
  const data = newMessages.map(m => JSON.stringify(m)).join('\n') + '\n'
  vfs.appendFileSync(MESSAGES_PATH, data)
}

export function rewriteMessages (vfs: VirtualFileSystem, messages: CoreMessage[]): void {
  vfs.mkdirSync(SESSION_DIR, { recursive: true })
  const data = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
  vfs.writeFileSync(MESSAGES_PATH, data)
}
