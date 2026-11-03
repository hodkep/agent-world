import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** What the key store needs from the system keychain: Electron's `safeStorage`, or a stand-in in a test. */
export interface KeyCrypto {
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

/** Electron says encryption is available even on a Linux with no keyring, where it falls back to a built-in password (`basic_text`): that hides nothing, so it does not count. */
export const keychainUsable = (available: boolean, backend?: string) => available && backend !== 'basic_text'

/** The person's Gemini key, kept encrypted in a file of its own: never in the preferences file and never handed to the page. */
export function keyStore(file: string, crypto: KeyCrypto) {
  return {
    /** A key is saved, whether or not the keychain lets it be read. */
    exists: () => existsSync(file),
    /** The key, or null when there is none or the keychain cannot open the file (a file from another computer or user). */
    get(): string | null {
      try {
        return existsSync(file) ? crypto.decrypt(readFileSync(file)) : null
      } catch {
        return null
      }
    },
    set(key: string) {
      if (!crypto.isAvailable()) throw new Error("The system keychain is not available, so the key can't be kept safely.")
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, crypto.encrypt(key), { mode: 0o600 })
      chmodSync(file, 0o600)
    },
    clear: () => rmSync(file, { force: true })
  }
}
