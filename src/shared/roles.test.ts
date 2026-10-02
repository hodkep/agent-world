import { describe, expect, it } from 'vitest'
import { launchArgs } from '../main/claude'
import { BUILT_IN_ROLES, isCurrentRole, withRole } from './roles'

const reviewer = BUILT_IN_ROLES.find((r) => r.id === 'reviewer')!
const hired = { ...reviewer.options, role: 'Reviewer', model: 'opus', budgetUsd: 5 }
const launch = (options: typeof hired | object) => launchArgs({ sessionId: 's1', name: 'rex', started: true, settingsFile: '/s.json', options })

describe('changing an agent to another role', () => {
  it('leaving Reviewer for no role drops the read-only instruction and plan mode, and keeps the rest', () => {
    const after = withRole(hired, null)
    expect(after).toEqual({ model: 'opus', budgetUsd: 5 })
    const args = launch(after)
    expect(args.join(' ')).not.toMatch(/code reviewer|read-only/i)
    expect(args).not.toContain('--permission-mode')
    expect(args).toEqual(expect.arrayContaining(['--resume', 's1', '--model', 'opus']))
  })

  it('the old role is gone from the launch args when a new one replaces it', () => {
    const fixer = BUILT_IN_ROLES.find((r) => r.id === 'fixer')!
    const args = launch(withRole(hired, { ...fixer, options: { ...fixer.options, role: fixer.title } }))
    expect(args[args.indexOf('--append-system-prompt') + 1]).toMatch(/You fix bugs/)
    expect(args.join(' ')).not.toMatch(/code reviewer/)
    expect(args).not.toContain('plan')
  })
})

describe('which role is current', () => {
  it('matches a role by the title stored in the agent options; no stored role means No role', () => {
    expect(isCurrentRole('Reviewer', reviewer)).toBe(true)
    expect(isCurrentRole('Reviewer', null)).toBe(false)
    expect(isCurrentRole('Reviewer', BUILT_IN_ROLES[0]!)).toBe(false)
    for (const none of [undefined, '']) {
      expect(isCurrentRole(none, null)).toBe(true)
      expect(isCurrentRole(none, reviewer)).toBe(false)
    }
  })
})
