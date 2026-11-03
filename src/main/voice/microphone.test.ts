import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The packaged Mac app runs under the hardened runtime: without these two the system never asks for, and never grants, the microphone.
const root = process.cwd()
describe('the packaged Mac app and the microphone', () => {
  it('is entitled to record audio', () => {
    expect(readFileSync(join(root, 'build/entitlements.mac.plist'), 'utf8')).toMatch(/<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/)
  })
  it('tells the person why it wants the microphone', () => {
    expect(readFileSync(join(root, 'electron-builder.yml'), 'utf8')).toMatch(/NSMicrophoneUsageDescription:\s*\S+/)
  })
})
