export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
  close(): Promise<void>
}
