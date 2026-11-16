import { describe, expect, it } from 'vitest'
import { previewAllows } from './previewPermission'

describe('previewAllows', () => {
  it('lets a page in Preview go fullscreen, as a video player does', () => {
    expect(previewAllows('fullscreen')).toBe(true)
  })
  it('refuses everything else a page may ask for', () => {
    for (const p of ['media', 'geolocation', 'notifications', 'clipboard-read', 'pointerLock', 'openExternal']) expect(previewAllows(p)).toBe(false)
  })
})
