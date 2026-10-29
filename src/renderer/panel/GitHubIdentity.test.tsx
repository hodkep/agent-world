// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IdentityState } from '../../shared/identity'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const { GitHubProfiles, ProjectIdentity } = await import('./GitHubIdentity')

const work = { id: 'work', name: 'Sarvaha work', login: 'pratikGhodke1', gitName: 'Pratik Ghodke', gitEmail: 'pratik.ghodke@sarvaha.com' }
const mine = { id: 'mine', name: 'Agent World', login: 'hodkep', gitName: 'Pratik', gitEmail: 'p@users.noreply.github.com' }
const state = (over: Partial<IdentityState> = {}): IdentityState => ({
  identity: { profiles: [work, mine], byProject: { '/p/agent-world': 'mine' } },
  logins: [{ login: 'hodkep', active: true }, { login: 'pratikGhodke1', active: false }],
  ...over
})

function setup(s: IdentityState) {
  const save = vi.fn(async (identity: IdentityState['identity']) => ({ ...s, identity }))
  ;(window as unknown as { aw: unknown }).aw = { identity: { state: async () => s, save } }
  return save
}
const mount = async (el: React.ReactElement) => {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(el))
  return host
}
const type = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const project = { path: '/p/agent-world', name: 'agent-world' }

describe('the project identity pane', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('lists "Use current" and each profile, and marks the one picked for this project', async () => {
    setup(state())
    const host = await mount(<ProjectIdentity project={project} />)
    const opts = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(opts.map((o) => o.closest('label')!.textContent)).toEqual([expect.stringContaining('Use current'), expect.stringContaining('Sarvaha work'), expect.stringContaining('Agent World')])
    expect(opts.map((o) => o.checked)).toEqual([false, false, true])
  })

  it('saves the profile picked for this project only', async () => {
    const save = setup(state())
    const host = await mount(<ProjectIdentity project={project} />)
    await act(async () => void (host.querySelectorAll('input[type="radio"]')[1] as HTMLElement).click())
    expect(save).toHaveBeenCalledWith({ profiles: [work, mine], byProject: { '/p/agent-world': 'work' } })
  })

  it('"Use current" puts the project back to the machine settings', async () => {
    const save = setup(state())
    const host = await mount(<ProjectIdentity project={project} />)
    await act(async () => void (host.querySelectorAll('input[type="radio"]')[0] as HTMLElement).click())
    expect(save).toHaveBeenCalledWith({ profiles: [work, mine], byProject: {} })
  })

  it('warns when the login picked is not signed in to gh, and says how to fix it', async () => {
    setup(state({ logins: [{ login: 'pratikGhodke1', active: true }] }))
    const host = await mount(<ProjectIdentity project={project} />)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('hodkep')
    expect(host.textContent).toContain('gh auth login')
  })

  it('has no warning when the login is signed in', async () => {
    setup(state())
    const host = await mount(<ProjectIdentity project={project} />)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('says there are no profiles yet and where to make one', async () => {
    setup(state({ identity: { profiles: [], byProject: {} } }))
    const host = await mount(<ProjectIdentity project={project} />)
    expect(host.textContent).toContain('GitHub profiles')
  })
})

describe('the profiles pane', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('adds a profile from a name, a login and a commit name and email', async () => {
    const save = setup(state({ identity: { profiles: [], byProject: {} } }))
    const host = await mount(<GitHubProfiles />)
    await act(async () => void ([...host.querySelectorAll('button')].find((b) => b.textContent === 'New profile') as HTMLElement).click())
    await type(host.querySelector('input[aria-label="Profile name"]') as HTMLInputElement, 'Team B')
    await act(async () => {
      const sel = host.querySelector('select[aria-label="GitHub login"]') as HTMLSelectElement
      sel.value = 'pratikGhodke1'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await type(host.querySelector('input[aria-label="Commit name"]') as HTMLInputElement, 'Pratik Ghodke')
    await type(host.querySelector('input[aria-label="Commit email"]') as HTMLInputElement, 'p@teamb.com')
    await act(async () => void ([...host.querySelectorAll('button')].find((b) => b.textContent === 'Save profile') as HTMLElement).click())
    expect(save).toHaveBeenCalledWith({ profiles: [{ id: 'team-b', name: 'Team B', login: 'pratikGhodke1', gitName: 'Pratik Ghodke', gitEmail: 'p@teamb.com' }], byProject: {} })
  })

  it('will not save an email without an @', async () => {
    setup(state({ identity: { profiles: [], byProject: {} } }))
    const host = await mount(<GitHubProfiles />)
    await act(async () => void ([...host.querySelectorAll('button')].find((b) => b.textContent === 'New profile') as HTMLElement).click())
    await type(host.querySelector('input[aria-label="Profile name"]') as HTMLInputElement, 'X')
    await type(host.querySelector('input[aria-label="Commit email"]') as HTMLInputElement, 'nope')
    expect(([...host.querySelectorAll('button')].find((b) => b.textContent === 'Save profile') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows which projects use a profile and removes it with them', async () => {
    const save = setup(state())
    const host = await mount(<GitHubProfiles />)
    expect(host.textContent).toContain('1 project')
    await act(async () => void (host.querySelector('[data-profile="mine"]') as HTMLElement).click())
    await act(async () => void ([...host.querySelectorAll('button')].find((b) => b.textContent === 'Delete') as HTMLElement).click())
    expect(save).toHaveBeenCalledWith({ profiles: [work], byProject: {} })
  })
})

describe('before the saved state has loaded', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  const never = () => ((window as unknown as { aw: unknown }).aw = { identity: { state: () => new Promise(() => {}), save: async () => state() } })

  it('the project pane already has its heading and lead line, so the Settings page is never an empty box', async () => {
    never()
    const host = await mount(<ProjectIdentity project={project} />)
    expect(host.querySelector('legend')?.textContent).toBe('GitHub identity')
    expect(host.querySelector('.set-lead')).not.toBeNull()
    expect(host.querySelector('input')).toBeNull()
  })

  it('the profiles pane too', async () => {
    never()
    const host = await mount(<GitHubProfiles />)
    expect(host.querySelector('legend')?.textContent).toBe('GitHub profiles')
    expect(host.querySelector('.set-lead')).not.toBeNull()
  })
})
