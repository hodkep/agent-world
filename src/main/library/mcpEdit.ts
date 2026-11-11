import type { McpWhere } from '../../shared/mcp'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const NAME = /^[\w.-]{1,64}$/
const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])
const plain = (n: string) => NAME.test(n) && !RESERVED.has(n)
/** What a secret shows as on the screen: a value left as this is kept as it was. */
export const MASK = '••••••••'

const URL_PARTS = /^([a-z][a-z0-9+.-]*:\/\/)(?:([^@/?#]*)@)?([^/?#]*)([^?#]*)(?:\?([^#]*))?(#.*)?$/i

/** An address with the password and each query value masked: a key is often in the address itself. */
function maskUrl(url: string): string {
  const m = URL_PARTS.exec(url)
  if (!m) return url
  const [, scheme, user, host, path, query, hash] = m
  const u = user === undefined ? '' : user.includes(':') ? `${user.split(':')[0]}:${MASK}@` : `${user}@`
  const q = query === undefined ? '' : `?${query.split('&').map((p) => `${p.split('=')[0]}=${MASK}`).join('&')}`
  return `${scheme}${u}${host}${path}${q}${hash ?? ''}`
}

/** The entry as the screen shows it: what holds a secret is masked, so a value never reaches the screen. */
export function maskEntry(def: Obj): Obj {
  const out: Obj = { ...def }
  for (const k of ['env', 'headers']) if (isObj(def[k])) out[k] = Object.fromEntries(Object.keys(def[k] as Obj).map((n) => [n, MASK]))
  if (typeof def.url === 'string') out.url = maskUrl(def.url)
  return out
}

function unmaskUrl(url: string, old: unknown): string {
  if (!url.includes(MASK)) return url
  const was = typeof old === 'string' ? URL_PARTS.exec(old) : null
  const m = URL_PARTS.exec(url)
  if (!m) return url
  const [, scheme, user, host, path, query, hash] = m
  let u = ''
  if (user !== undefined) {
    const name = user.split(':')[0]
    if (user.includes(MASK)) {
      const oldPw = was?.[2]?.split(':').slice(1).join(':')
      if (oldPw === undefined) throw new Error('Type the password in the address: there is none to keep.')
      u = `${name}:${oldPw}@`
    } else u = `${user}@`
  }
  const oldQuery = new Map((was?.[5] ?? '').split('&').filter(Boolean).map((p) => [p.split('=')[0]!, p.split('=').slice(1).join('=')]))
  const q = query === undefined ? '' : `?${query.split('&').map((p) => {
    const [k, ...v] = p.split('=')
    if (v.join('=') !== MASK) return p
    const kept = oldQuery.get(k!)
    if (kept === undefined) throw new Error(`Type a value for ${k} in the address: there is none to keep.`)
    return `${k}=${kept}`
  }).join('&')}`
  return `${scheme}${u}${host}${path}${q}${hash ?? ''}`
}

/** Puts back what the screen masked: a value left as the mask is the entry's own, a value typed over it is the new one. */
export function unmaskEntry(entry: Obj, old: Obj | undefined): Obj {
  const out: Obj = { ...entry }
  for (const k of ['env', 'headers']) {
    if (!isObj(entry[k])) continue
    const was = isObj(old?.[k]) ? (old![k] as Obj) : {}
    out[k] = Object.fromEntries(
      Object.entries(entry[k] as Obj).map(([n, v]) => {
        if (v !== MASK) return [n, v]
        if (typeof was[n] !== 'string') throw new Error(`Type a value for ${n}: there is none to keep.`)
        return [n, was[n]]
      })
    )
  }
  if (typeof entry.url === 'string') out.url = unmaskUrl(entry.url, old?.url)
  return out
}

/** Checks the text of an entry against what a program reads, and answers it as an object; the message is the person's to read. */
export function prepareEntry(text: string): Obj {
  if (text.length > 100_000) throw new Error('That entry is too large to be a server entry (over 100 KB).')
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch (e) {
    throw new Error(`That is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!isObj(v)) throw new Error('An entry is a JSON object, between { and }.')
  const { type, command, args, env, url, headers } = v
  if (type !== undefined && type !== 'stdio' && type !== 'http' && type !== 'sse') throw new Error('type is stdio, http or sse.')
  if (command !== undefined && url !== undefined) throw new Error('An entry has a command or a url, not both.')
  if (url !== undefined) {
    let u: URL
    try {
      u = new URL(String(url))
    } catch {
      throw new Error('url is not an address.')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('url must start with http:// or https://.')
  } else if (typeof command !== 'string' || !command.trim() || command.trim().startsWith('-')) throw new Error('An entry needs a command (what starts the server) or a url.')
  if (args !== undefined && !(Array.isArray(args) && args.every((a) => typeof a === 'string'))) throw new Error('args is a list of text.')
  for (const [k, m] of [['env', env], ['headers', headers]] as const) if (m !== undefined && !(isObj(m) && Object.values(m).every((x) => typeof x === 'string'))) throw new Error(`${k} is names with text values.`)
  return v
}

export type Place = { kind: 'global' } | { kind: 'project'; project: string } | { kind: 'file' }

const listOf = (root: Obj, place: Place, create: boolean): Obj | null => {
  const holder = place.kind === 'project' ? (isObj(root.projects) ? root.projects : create ? (root.projects = {}) : null) : root
  if (!holder) return null
  const scope = place.kind === 'project' ? (isObj(holder[place.project]) ? (holder[place.project] as Obj) : create ? (holder[place.project] = {}) : null) : holder
  if (!scope) return null
  if (isObj(scope.mcpServers)) return scope.mcpServers
  return create ? (scope.mcpServers = {}) : null
}

/**
 * The text of a file after adding, changing, renaming or removing one entry: everything else in the file stays, with its indentation. `oldName` is the entry as it is
 * now (none to add), `newName` and `def` what it becomes (null to remove). Throws, writing nothing, when the file is not JSON or the name is taken.
 */
export function editFile(text: string | null, place: Place, oldName: string | undefined, newName: string | null, def: Obj | null): string {
  let root: Obj = {}
  let indent = 2
  if (text !== null) {
    try {
      const v = JSON.parse(text) as unknown
      if (!isObj(v)) throw new Error('not an object')
      root = v
    } catch {
      throw new Error('This file is not valid JSON, so nothing was written to it.')
    }
    indent = /^\{\n( +)"/.exec(text)?.[1]?.length ?? 2
  }
  for (const n of [oldName, newName]) if (n !== undefined && n !== null && !plain(n)) throw new Error(`"${n}" is not a name: use letters, digits, dots, dashes and underscores, up to 64.`)
  const list = listOf(root, place, def !== null)
  if (def === null) {
    if (list && oldName !== undefined) delete list[oldName]
  } else {
    if (!list || newName === null) throw new Error('Nothing to write.')
    if (newName !== oldName && Object.hasOwn(list, newName)) throw new Error(`"${newName}" is already in this list.`)
    if (oldName !== undefined) delete list[oldName]
    list[newName] = def
  }
  return JSON.stringify(root, null, indent) + '\n'
}

/** The entry of a server as its own file has it, with every value: only the main process reads this, to start the server or to keep a value left masked. */
export function findRaw(read: (file: string) => string | null, s: { where: McpWhere; path: string; project?: string; name: string }): Obj | null {
  try {
    const text = read(s.path)
    const root = text === null ? null : (JSON.parse(text) as unknown)
    if (!isObj(root)) return null
    const list = listOf(root, s.where === 'project' && !s.path.endsWith('.mcp.json') ? { kind: 'project', project: s.project ?? '' } : { kind: 'file' }, false)
    const def = list && Object.hasOwn(list, s.name) ? list[s.name] : null
    return isObj(def) ? def : null
  } catch {
    return null
  }
}

/** The text of a file with the `disabled` flag taken out of one entry, or null when there is nothing to change (not switched off, not there, or a file that is not JSON). */
export function enableEntry(text: string | null, place: Place, name: string): string | null {
  if (text === null) return null
  try {
    const root = JSON.parse(text) as unknown
    if (!isObj(root)) return null
    const list = listOf(root, place, false)
    const def = list && Object.hasOwn(list, name) ? list[name] : null
    if (!isObj(def) || def.disabled !== true) return null
    const { disabled: _off, ...rest } = def
    return editFile(text, place, name, name, rest)
  } catch {
    return null
  }
}
