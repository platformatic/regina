#!/usr/bin/env -S node

import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { inc, type ReleaseType } from 'semver'

type UserInfo = [string, string]

function getUserInfo (): UserInfo {
  const username = process.argv[3] ?? process.env.GITHUB_ACTOR
  const defaultUser = 'mcollina'

  const users: Record<string, UserInfo> = {
    mcollina: ['Matteo Collina', 'hello@matteocollina.com'],
    ShogunPanda: ['Paolo Insogna', 'paolo@cowtech.it']
  }

  let userInfo = users[username]

  if (!userInfo) {
    userInfo = users[defaultUser]
  }

  return userInfo
}

async function getVersion (): Promise<string> {
  const version = process.argv[2].replace(/^v/, '')

  if (['minor', 'major', 'patch'].includes(process.argv[2])) {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
    return inc(packageJson.version, version as ReleaseType)!
  }

  return version
}

async function updatePackageJson (prefix: string, version: string): Promise<void> {
  const packageJson = JSON.parse(await readFile(resolve(prefix, 'package.json'), 'utf8'))
  packageJson.version = version
  await writeFile(resolve(prefix, 'package.json'), JSON.stringify(packageJson, null, 2))
}

const userInfo = getUserInfo()
const version = await getVersion()

for (const prefix of ['.', 'packages/regina', 'packages/regina-agent', 'packages/regina-storage']) {
  await updatePackageJson(prefix, version)
}

if (process.env.GITHUB_ACTIONS === 'true') {
  execSync(`git config --global user.name "${userInfo[0]}"`)
  execSync(`git config --global user.email "${userInfo[1]}"`)
}

execSync(`git commit -a -m "chore: Bumped v${version}." -m "Signed-off-by: ${userInfo[0]} <${userInfo[1]}>"`)
