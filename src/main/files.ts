import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { createReadStream, realpathSync, statSync } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FileInfo, FileKind } from '../shared/files'

const CODE = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'css', 'scss', 'less', 'vue', 'svelte', 'yaml', 'yml', 'toml', 'json', 'xml', 'gradle', 'lua', 'r', 'dart', 'scala'])
const TEXT = new Set(['txt', 'log', 'csv', 'tsv', 'env', 'ini', 'conf', 'cfg', 'rst', 'tex'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

export function kindOf(path: string): FileKind {
  const ext = extname(path).slice(1).toLowerCase()
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return 'markdown'
  if (ext === 'pdf') return 'pdf'
  if (IMAGE.has(ext)) return 'image'
  if (CODE.has(ext)) return 'code'
  if (TEXT.has(ext) || (!ext && /^(readme|license|makefile|dockerfile|changelog)$/i.test(basename(path)))) return 'text'
  return 'other'
}

/** A path as written by an agent (absolute, ~/…, or relative to its folder) resolved to a real file, or null. */
export async function resolveFile(cwd: string, written: string): Promise<FileInfo | null> {
  const p = written.replace(/^file:\/\//, '')
  const full = p.startsWith('~/') ? join(homedir(), p.slice(2)) : isAbsolute(p) ? p : resolve(cwd, p)
  try {
    const real = await realpath(full)
    const st = await stat(real)
    if (!st.isFile()) return null
    let rel: string | undefined
    try {
      const r = relative(await realpath(cwd), real)
      if (r && !r.startsWith('..') && !isAbsolute(r)) rel = r
    } catch {
      /* the folder is gone; nothing is inside it */
    }
    return { path: real, name: basename(real), kind: kindOf(real), size: st.size, inside: rel !== undefined, ...(rel && { rel }) }
  } catch {
    return null
  }
}

/** A file or a folder an agent mentioned, resolved the same way; a folder comes back as kind `folder` (it cannot be opened in the viewer, only shown in Finder). */
export async function resolveEntry(cwd: string, written: string): Promise<FileInfo | null> {
  const file = await resolveFile(cwd, written)
  if (file) return file
  const p = written.replace(/^file:\/\//, '')
  const full = p.startsWith('~/') ? join(homedir(), p.slice(2)) : isAbsolute(p) ? p : resolve(cwd, p)
  try {
    const real = await realpath(full)
    if (!(await stat(real)).isDirectory()) return null
    let rel: string | undefined
    try {
      const r = relative(await realpath(cwd), real)
      if (r && !r.startsWith('..') && !isAbsolute(r)) rel = r
    } catch {
      /* the folder is gone; nothing is inside it */
    }
    return { path: real, name: basename(real), kind: 'folder', size: 0, inside: rel !== undefined, ...(rel && { rel }) }
  } catch {
    return null
  }
}

const MAX_TEXT = 2 * 1024 * 1024

/** The text of a file for the viewer, cut at 2 MB. */
export async function readText(path: string): Promise<{ text: string; truncated: boolean }> {
  const buf = await readFile(path)
  const truncated = buf.length > MAX_TEXT
  return { text: buf.subarray(0, MAX_TEXT).toString('utf8'), truncated }
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', map: 'application/json'
}

interface Share {
  root: string
  /** When the file sits straight in the home folder (or the disk's root), only that one file is served. */
  only?: string
}

/**
 * Shows a local HTML page (or PDF) at a web address on this machine, so its CSS, scripts and pictures load beside it and the
 * Preview's page-picker works on it. Each shared file gets a random address; nothing outside the file's own folder is reachable.
 */
export async function startFileServer() {
  const shares = new Map<string, Share>()
  const server: Server = createServer((req, res) => {
    const m = /^\/([0-9a-f]{32})\/(.*)$/.exec(req.url?.split('?')[0] ?? '')
    const share = m && shares.get(m[1]!)
    if (req.method !== 'GET' || !m || !share) return void res.writeHead(404).end()
    let rest: string
    try {
      rest = decodeURIComponent(m[2]!)
    } catch {
      return void res.writeHead(400).end()
    }
    const file = resolve(share.root, rest)
    if ((file !== share.root && !file.startsWith(share.root + sep)) || (share.only && file !== share.only)) return void res.writeHead(403).end()
    try {
      if (!statSync(file).isFile()) return void res.writeHead(404).end()
    } catch {
      return void res.writeHead(404).end()
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    port,
    /** The file on disk behind an address this server handed out (the page, or what sits beside it); null for any other address or a file that is gone. */
    pathOf(address: string): string | null {
      try {
        const u = new URL(address)
        const m = /^\/([0-9a-f]{32})\/(.*)$/.exec(u.pathname)
        const share = u.hostname === '127.0.0.1' && Number(u.port) === port && m && shares.get(m[1]!)
        if (!share) return null
        const file = resolve(share.root, decodeURIComponent(m[2]!))
        if ((file !== share.root && !file.startsWith(share.root + sep)) || (share.only && file !== share.only)) return null
        return statSync(file).isFile() ? realpathSync(file) : null
      } catch {
        return null
      }
    },
    urlFor(file: string): string {
      const dir = dirname(file)
      const broad = dir === homedir() || dir === sep
      const token = randomBytes(16).toString('hex')
      shares.set(token, { root: dir, ...(broad && { only: file }) })
      return `http://127.0.0.1:${port}/${token}/${encodeURIComponent(basename(file))}`
    },
    close() {
      server.closeAllConnections()
      server.close()
    }
  }
}
