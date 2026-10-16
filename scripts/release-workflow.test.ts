import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8')

describe('the release workflow', () => {
  const wf = read('.github/workflows/release.yml')
  const SECRETS = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
  it('passes the five signing secrets to the build', () => {
    for (const s of SECRETS) expect(wf, s).toContain(`secrets.${s}`)
  })
  it('signs and notarises only when the certificate is there, and otherwise keeps the ad hoc build', () => {
    const guard = wf.indexOf('if [ "$RUNNER_OS" = "macOS" ] && [ -n "$CSC_LINK" ]')
    expect(guard).toBeGreaterThan(0)
    // the override and the notarisation sit inside that condition, after it and before its end
    const inside = wf.slice(guard, wf.indexOf('\n          else', guard))
    expect(inside).toContain('--config.mac.identity=null')
    expect(inside).toContain('--config.mac.notarize=true')
    // only a signed build says so about itself
    expect(inside).toContain('--config.extraMetadata.awSigned=true')
    expect(wf.replace(inside, '')).not.toContain('awSigned=true')
    expect(wf.replace(inside, '')).not.toContain('identity=null')
  })
  it('runs on a version tag and publishes to the releases', () => {
    expect(wf).toContain("tags: ['v*']")
    expect(wf).toContain('--publish always')
  })
})

describe('RELEASING.md', () => {
  const doc = read('RELEASING.md')
  it('names the five secrets, the tag, and how to take a release back', () => {
    for (const s of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) expect(doc, s).toContain(s)
    expect(doc).toContain('v0.1.0')
    expect(doc.toLowerCase()).toContain('delete the release')
  })
})
