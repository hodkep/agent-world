import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const MAX_BYTES = 25 * 1024 * 1024
// What Claude can usefully read; nothing that could be run.
const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.md', '.json', '.csv', '.log', '.yaml', '.yml', '.xml', '.html'])
const BY_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'application/pdf': '.pdf', 'text/plain': '.txt' }

/** Saves a picture or file the user attached in the chat; the agent then reads it by path. Returns that path. */
export function saveAttachment(root: string, agentId: string, rawName: string, bytes: Uint8Array, mime = ''): string {
  if (bytes.byteLength > MAX_BYTES) throw new Error('That file is too large to attach (25 MB at most).')
  const safeName = basename(rawName).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  let ext = extname(safeName).toLowerCase()
  let name = safeName
  if (!ext) {
    ext = BY_MIME[mime] ?? ''
    name = `${safeName || 'pasted'}${ext}`
  }
  if (!ALLOWED.has(ext)) throw new Error(`Files of this type (${ext || 'unknown'}) cannot be attached; pictures, PDFs and text files can.`)
  const dir = join(root, agentId.replace(/[^A-Za-z0-9-]/g, ''))
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, `${Date.now()}-${name}`)
  writeFileSync(path, bytes, { mode: 0o600 })
  return path
}
