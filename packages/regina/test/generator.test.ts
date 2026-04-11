import { deepEqual, deepStrictEqual, strictEqual, ok } from 'node:assert'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Generator } from '../src/index.ts'

test('generator - default config has regina settings', () => {
  const generator = new Generator()
  const defaultConfig = generator.getDefaultConfig()

  strictEqual(defaultConfig.hostname, '0.0.0.0')
  strictEqual(defaultConfig.port, 3042)
  deepEqual(defaultConfig.regina, {
    agentsDir: './agents',
    defaults: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      maxSteps: 10
    }
  })
})

test('generator - default config disables typescript, tests, plugin', () => {
  const generator = new Generator()
  const defaultConfig = generator.getDefaultConfig()

  strictEqual(defaultConfig.skipTypescript, true)
  strictEqual(defaultConfig.tests, false)
  strictEqual(defaultConfig.plugin, false)
})

test('generator - config fields include agents dir', () => {
  const generator = new Generator()
  const configFieldsDefs = generator.getConfigFieldsDefinitions()
  const reginaField = configFieldsDefs.find((f: { var: string }) => f.var === 'PLT_REGINA_AGENTS_DIR')

  ok(reginaField, 'should have PLT_REGINA_AGENTS_DIR field')
  strictEqual(reginaField.label, 'Agents directory')
  strictEqual(reginaField.default, './agents')
  strictEqual(reginaField.type, 'string')
})

test('generator - config fields include service fields', () => {
  const generator = new Generator()
  const configFieldsDefs = generator.getConfigFieldsDefinitions()
  const hostnameField = configFieldsDefs.find((f: { var: string }) => f.var === 'PLT_SERVER_HOSTNAME')
  const portField = configFieldsDefs.find((f: { var: string }) => f.var === 'PORT')

  ok(hostnameField, 'should include PLT_SERVER_HOSTNAME from service')
  ok(portField, 'should include PORT from service')
})

test('generator - scaffolds a stackable app', async (t) => {
  const testDir = await mkdtemp(join(tmpdir(), 'regina-'))
  t.after(() => rm(testDir, { recursive: true, force: true }))

  const generator = new Generator()

  generator.setConfig({
    applicationName: 'regina-app',
    targetDirectory: testDir
  })

  await generator.prepare()
  await generator.writeFiles()

  const files = await readdir(testDir)
  deepStrictEqual(files.sort(), [
    '.env',
    '.env.sample',
    '.gitignore',
    'README.md',
    'package.json',
    'platformatic.json',
    'plt-env.d.ts'
  ])
})

test('generator - scaffolded platformatic.json has regina config', async (t) => {
  const testDir = await mkdtemp(join(tmpdir(), 'regina-'))
  t.after(() => rm(testDir, { recursive: true, force: true }))

  const generator = new Generator()

  generator.setConfig({
    applicationName: 'regina-app',
    targetDirectory: testDir
  })

  await generator.prepare()
  await generator.writeFiles()

  const configContent = JSON.parse(await readFile(join(testDir, 'platformatic.json'), 'utf-8'))
  ok(configContent.$schema, 'should have $schema')
  ok(configContent.$schema.includes('@platformatic/regina'), '$schema should reference regina')
  strictEqual(configContent.module, '@platformatic/regina')
  ok(configContent.regina, 'should have regina config block')
  ok(configContent.regina.agentsDir, 'should have agentsDir in regina config')
})

test('generator - scaffolded package.json has regina dependency', async (t) => {
  const testDir = await mkdtemp(join(tmpdir(), 'regina-'))
  t.after(() => rm(testDir, { recursive: true, force: true }))

  const generator = new Generator()

  generator.setConfig({
    applicationName: 'regina-app',
    targetDirectory: testDir
  })

  await generator.prepare()
  await generator.writeFiles()

  const pkgContent = JSON.parse(await readFile(join(testDir, 'package.json'), 'utf-8'))
  ok(pkgContent.dependencies['@platformatic/regina'], 'should depend on @platformatic/regina')
})

test('generator - .env includes agents dir variable', async (t) => {
  const testDir = await mkdtemp(join(tmpdir(), 'regina-'))
  t.after(() => rm(testDir, { recursive: true, force: true }))

  const generator = new Generator()

  generator.setConfig({
    applicationName: 'regina-app',
    targetDirectory: testDir
  })

  await generator.prepare()
  await generator.writeFiles()

  const envContent = await readFile(join(testDir, '.env'), 'utf-8')
  ok(envContent.includes('PLT_REGINA_AGENTS_DIR'), '.env should include agents dir variable')
})
