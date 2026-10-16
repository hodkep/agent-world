#!/usr/bin/env node
// Downloads the git that is bundled with the app, for each system and kind of processor it is built for, into build/git/<system>-<arch>/.
// The archives are dugite-native's (the git GitHub Desktop ships), pinned with their sha256 in scripts/git-archives.json.
//   node scripts/fetch-git.mjs                       the one for this computer
//   node scripts/fetch-git.mjs --platform            every kind of processor of this system (both Macs)
//   node scripts/fetch-git.mjs darwin-arm64 darwin-x64
// electron-builder copies the folder of the system it builds for into the app (see extraResources in electron-builder.yml). One folder for each
// processor is why this is a script and not the dugite package: that package downloads only the git of the computer it is installed on, so an
// Intel Mac build made on an Apple silicon computer would carry a git that does not run.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const keyFor = (platform, arch) => `${platform}-${arch}`

export function archiveFor(key, archives) {
  const a = archives[key]
  if (!a) throw new Error(`No git is pinned for ${key}. Add it to scripts/git-archives.json.`)
  return a
}

/** What to download for the arguments given: nothing named is this computer's, `--platform` is every pinned processor of this system, else what was named. */
export function keysToFetch(args, archives, platform, arch) {
  if (args.includes('--platform')) return Object.keys(archives).filter((k) => k.startsWith(`${platform}-`))
  return args.length ? args : [keyFor(platform, arch)]
}

export async function verifySha256(file, expected) {
  const h = createHash('sha256')
  await pipeline(createReadStream(file), h)
  const got = h.digest('hex')
  if (got !== expected) throw new Error(`Validation failed for ${file}: expected ${expected} but got ${got}`)
}

const run = (cmd, args) => new Promise((ok, fail) => spawn(cmd, args, { stdio: 'inherit' }).on('error', fail).on('exit', (c) => (c === 0 ? ok() : fail(new Error(`${cmd} ${args.join(' ')} exited with ${c}`)))))

async function fetchOne(key, root) {
  const a = archiveFor(key, JSON.parse(readFileSync(join(here, 'git-archives.json'), 'utf8')))
  const out = join(root, key)
  const stamp = join(out, '.sha256')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === a.sha256) return console.log(`git for ${key}: already there`)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const file = join(root, `${key}.tar.gz`)
  console.log(`git for ${key}: downloading ${a.url}`)
  const res = await fetch(a.url, { headers: { 'User-Agent': 'agent-world-build' }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Got ${res.status} downloading ${a.url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
  await verifySha256(file, a.sha256)
  // tar keeps the links the archive holds; it is on macOS, Linux and Windows 10 and later.
  await run('tar', ['-xzf', file, '-C', out])
  rmSync(file)
  writeFileSync(stamp, a.sha256)
  console.log(`git for ${key}: ready in ${out}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const keys = keysToFetch(process.argv.slice(2), JSON.parse(readFileSync(join(here, 'git-archives.json'), 'utf8')), process.platform, process.arch)
  const root = resolve(here, '..', 'build', 'git')
  mkdirSync(root, { recursive: true })
  for (const key of keys) await fetchOne(key, root)
}
