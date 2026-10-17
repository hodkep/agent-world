import { describe, expect, it } from 'vitest'
import { setupSteps } from './setupSteps'

const names = (s: ReturnType<typeof setupSteps>) => s.map((x) => x.name)
const marks = (s: ReturnType<typeof setupSteps>) => s.map((x) => x.status)

describe('the steps a provider card lists', () => {
  it('are always Install, Sign in, Ready', () => {
    expect(names(setupSteps('not-installed', {}))).toEqual(['Install', 'Sign in', 'Ready'])
  })

  it('start at Install while the tool is not found', () => {
    expect(marks(setupSteps('not-installed', {}))).toEqual(['now', 'todo', 'todo'])
    expect(setupSteps('not-installed', { installing: true })[0]!.hint).toMatch(/running/i)
  })

  it('move to Sign in once it is installed, and say what to do in the terminal when one is open', () => {
    expect(marks(setupSteps('needs-sign-in', { version: '1.4.0' }))).toEqual(['done', 'now', 'todo'])
    expect(setupSteps('needs-sign-in', { version: '1.4.0' })[0]!.hint).toBe('Installed v1.4.0')
    expect(setupSteps('needs-sign-in', { signingIn: true })[1]!.hint).toBe('Open the page, copy the code, paste it in the terminal below')
    expect(setupSteps('needs-sign-in', {})[1]!.hint).toMatch(/open a terminal/i)
  })

  it('are all done when it is ready', () => {
    expect(marks(setupSteps('ready', {}))).toEqual(['done', 'done', 'done'])
  })
})
