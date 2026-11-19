import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { officeAssets } from './officeAssets'

describe('the files the Office viewer page is served with', () => {
  it('holds every script the page and the frame ask for', () => {
    const wanted = [...officeAssets['viewer.html']!.body.matchAll(/<script src="([^"]+)"/g), ...officeAssets['frame.js']!.body.matchAll(/lib\('([^']+)'\)/g)].map((m) => m[1]!)
    expect(wanted).toEqual(expect.arrayContaining(['frame.js', 'jszip.js', 'docx.js', 'xlsx.js', 'pptx.js']))
    for (const f of wanted) expect(officeAssets[f], f).toBeDefined()
  })

  it('serves each as the right type, and the page as html', () => {
    expect(officeAssets['viewer.html']!.type).toContain('text/html')
    for (const f of ['frame.js', 'jszip.js', 'docx.js', 'xlsx.js', 'pptx.js']) expect(officeAssets[f]!.type).toContain('text/javascript')
  })

  // SheetJS is installed from its own download site, and the lockfile cannot pin that file (pnpm keeps no checksum for it), so this does:
  // the build that was reviewed (0.20.3, mini). A different file there fails here, and a new version is reviewed before this changes.
  it('holds the SheetJS build that was reviewed', () => {
    expect(createHash('sha256').update(officeAssets['xlsx.js']!.body).digest('hex')).toBe('0cb353f830d7288385492c83d277b058ddeac664ca51cf1393aa1fd3e2b70939')
  })
})
