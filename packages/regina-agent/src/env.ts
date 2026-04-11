const ALLOWED_EXACT = new Set([
  'NODE_ENV', 'HOME', 'PATH', 'SHELL', 'USER', 'LANG',
  'TMPDIR', 'TMP', 'TEMP'
])

const ALLOWED_PREFIXES = ['PLT_']

export function sanitizeEnv (extra?: string[]): string[] {
  const exactKeys = new Set(ALLOWED_EXACT)
  const prefixes = [...ALLOWED_PREFIXES]

  if (extra) {
    for (const entry of extra) {
      if (entry.endsWith('*')) {
        prefixes.push(entry.slice(0, -1))
      } else {
        exactKeys.add(entry)
      }
    }
  }

  const removed: string[] = []

  for (const key of Object.keys(process.env)) {
    if (exactKeys.has(key)) continue
    if (prefixes.some(p => key.startsWith(p))) continue

    delete process.env[key]
    removed.push(key)
  }

  return removed
}
