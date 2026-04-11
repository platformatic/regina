import { deepStrictEqual, strictEqual } from 'node:assert'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { S3Adapter } from '../src/s3-adapter.ts'

function createBodyStream (data: Buffer) {
  const stream = Readable.from(data) as any
  stream.transformToByteArray = async () => new Uint8Array(data)
  return stream
}

test('put sends correct PutObjectCommand', async () => {
  const s3Mock = mockClient(S3Client)
  s3Mock.on(PutObjectCommand).resolves({})

  const adapter = new S3Adapter({ bucket: 'test-bucket', prefix: 'pfx' })
  const data = Buffer.from('state data')
  await adapter.put('agent-1', data)

  const call = s3Mock.commandCalls(PutObjectCommand)[0]
  strictEqual(call.args[0].input.Bucket, 'test-bucket')
  strictEqual(call.args[0].input.Key, 'pfx/agent-1.sqlite')
  deepStrictEqual(Buffer.from(call.args[0].input.Body as Uint8Array), data)

  s3Mock.restore()
  await adapter.close()
})

test('get returns data for existing key', async () => {
  const s3Mock = mockClient(S3Client)
  const data = Buffer.from('some state')
  s3Mock.on(GetObjectCommand).resolves({ Body: createBodyStream(data) })

  const adapter = new S3Adapter({ bucket: 'test-bucket' })
  const result = await adapter.get('agent-1')
  deepStrictEqual(result, data)

  const call = s3Mock.commandCalls(GetObjectCommand)[0]
  strictEqual(call.args[0].input.Bucket, 'test-bucket')
  strictEqual(call.args[0].input.Key, 'regina/agent-1.sqlite')

  s3Mock.restore()
  await adapter.close()
})

test('get returns null for NoSuchKey', async () => {
  const s3Mock = mockClient(S3Client)
  const err = new Error('NoSuchKey') as Error & { name: string }
  err.name = 'NoSuchKey'
  s3Mock.on(GetObjectCommand).rejects(err)

  const adapter = new S3Adapter({ bucket: 'test-bucket' })
  const result = await adapter.get('missing')
  strictEqual(result, null)

  s3Mock.restore()
  await adapter.close()
})

test('delete sends DeleteObjectCommand', async () => {
  const s3Mock = mockClient(S3Client)
  s3Mock.on(DeleteObjectCommand).resolves({})

  const adapter = new S3Adapter({ bucket: 'test-bucket', prefix: 'pfx' })
  await adapter.delete('agent-1')

  const call = s3Mock.commandCalls(DeleteObjectCommand)[0]
  strictEqual(call.args[0].input.Bucket, 'test-bucket')
  strictEqual(call.args[0].input.Key, 'pfx/agent-1.sqlite')

  s3Mock.restore()
  await adapter.close()
})

test('list returns filtered keys', async () => {
  const s3Mock = mockClient(S3Client)
  s3Mock.on(ListObjectsV2Command).resolves({
    Contents: [
      { Key: 'regina/app-one.sqlite' },
      { Key: 'regina/app-two.sqlite' },
    ],
  })

  const adapter = new S3Adapter({ bucket: 'test-bucket' })
  const result = await adapter.list('app-')

  const call = s3Mock.commandCalls(ListObjectsV2Command)[0]
  strictEqual(call.args[0].input.Bucket, 'test-bucket')
  strictEqual(call.args[0].input.Prefix, 'regina/app-')

  deepStrictEqual(result.sort(), ['app-one', 'app-two'])

  s3Mock.restore()
  await adapter.close()
})

test('list returns empty when no Contents', async () => {
  const s3Mock = mockClient(S3Client)
  s3Mock.on(ListObjectsV2Command).resolves({})

  const adapter = new S3Adapter({ bucket: 'test-bucket' })
  const result = await adapter.list('x')
  deepStrictEqual(result, [])

  s3Mock.restore()
  await adapter.close()
})
