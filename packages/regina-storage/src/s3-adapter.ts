import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { S3ClientConfig } from '@aws-sdk/client-s3'
import type { StorageAdapter } from './adapter.ts'

const SUFFIX = '.sqlite'

export interface S3AdapterOptions {
  bucket: string
  prefix?: string
  endpoint?: string
  region?: string
  credentials?: S3ClientConfig['credentials']
}

export class S3Adapter implements StorageAdapter {
  #client: S3Client
  #bucket: string
  #prefix: string

  constructor ({ bucket, prefix, endpoint, region, credentials }: S3AdapterOptions) {
    this.#bucket = bucket
    this.#prefix = prefix ?? 'regina'

    const config: S3ClientConfig = {}
    if (endpoint) config.endpoint = endpoint
    if (region) config.region = region
    if (credentials) config.credentials = credentials

    this.#client = new S3Client(config)
  }

  #objectKey (key: string): string {
    return `${this.#prefix}/${key}${SUFFIX}`
  }

  async put (key: string, data: Buffer): Promise<void> {
    await this.#client.send(new PutObjectCommand({
      Bucket: this.#bucket,
      Key: this.#objectKey(key),
      Body: data,
    }))
  }

  async get (key: string): Promise<Buffer | null> {
    try {
      const response = await this.#client.send(new GetObjectCommand({
        Bucket: this.#bucket,
        Key: this.#objectKey(key),
      }))
      const bytes = await response.Body!.transformToByteArray()
      return Buffer.from(bytes)
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NoSuchKey') {
        return null
      }
      throw err
    }
  }

  async delete (key: string): Promise<void> {
    // S3 DeleteObject does not throw on missing keys, so no special handling needed
    await this.#client.send(new DeleteObjectCommand({
      Bucket: this.#bucket,
      Key: this.#objectKey(key),
    }))
  }

  async list (prefix: string): Promise<string[]> {
    const fullPrefix = `${this.#prefix}/${prefix}`
    const response = await this.#client.send(new ListObjectsV2Command({
      Bucket: this.#bucket,
      Prefix: fullPrefix,
    }))

    if (!response.Contents) {
      return []
    }

    const results: string[] = []
    for (const obj of response.Contents) {
      if (obj.Key && obj.Key.endsWith(SUFFIX)) {
        const name = obj.Key.slice(this.#prefix.length + 1, -SUFFIX.length)
        results.push(name)
      }
    }
    return results
  }

  async close (): Promise<void> {
    this.#client.destroy()
  }
}
