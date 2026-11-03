// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillPlaces } from '../../shared/library'
import { SkillInstall } from './SkillInstall'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const places = (claude: 'none' | 'linked'): SkillPlaces => ({ claudeOff: [], targets: [], states: { 'find-skills': { claude } }, projects: [] })

function setup(claude: 'none' | 'linked') {
  const lib = {
    installList: vi.fn(async () => [{ name: 'find-skills', description: 'Finds skills.' }, { name: 'other', description: 'Other.' }]),
    install: vi.fn(async () => ({ names: ['find-skills'], added: ['find-skills'], skipped: [] }))
  }
  ;(window as unknown as { aw: unknown }).aw = { library: lib, onLibraryInstallLog: () => () => undefined }
  const onInstalled = vi.fn(async () => undefined)
  const onLinkClaude = vi.fn(async () => undefined)
  const host = document.body.appendChild(document.createElement('div'))
  const draw = (p: SkillPlaces) => act(async () => createRoot(host).render(<SkillInstall places={p} onClose={() => undefined} onInstalled={onInstalled} onLinkClaude={onLinkClaude} />))
  return { lib, host, onInstalled, onLinkClaude, draw: () => draw(places(claude)) }
}
const click = (host: HTMLElement, text: string) => act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text))!.click())
const type = (host: HTMLElement, v: string) => act(async () => {
  const i = host.querySelector('input')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, v)
  i.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('installing skills with the skills CLI', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('looks inside a repository, installs the ticked skills, and offers to link one plain Claude Code cannot see', async () => {
    const s = setup('none')
    await s.draw()
    expect(s.host.textContent).toContain('reports installs to its maker')
    await type(s.host, 'vercel-labs/skills')
    await click(s.host, 'Look inside')
    expect(s.lib.installList).toHaveBeenCalledWith('vercel-labs/skills')
    expect(s.host.textContent).toContain('Finds skills.')
    await click(s.host, 'Install 0')
    expect(s.lib.install).not.toHaveBeenCalled()
    await act(async () => void s.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await click(s.host, 'Install 1 skill')
    expect(s.lib.install).toHaveBeenCalledWith('vercel-labs/skills', ['find-skills'])
    expect(s.onInstalled).toHaveBeenCalled()
    expect(s.host.textContent).toContain('Plain Claude Code does not see it yet')
    await click(s.host, 'Link into ~/.claude/skills')
    expect(s.onLinkClaude).toHaveBeenCalledWith(['find-skills'])
  })
  it('says what went wrong when the CLI fails, and does not warn once the skill is linked', async () => {
    const s = setup('linked')
    s.lib.installList.mockRejectedValueOnce(new Error('boom: no such repository'))
    await s.draw()
    await type(s.host, 'a/b')
    await click(s.host, 'Look inside')
    expect(s.host.querySelector('[role="alert"]')?.textContent).toContain('boom: no such repository')
    await type(s.host, 'vercel-labs/skills')
    await click(s.host, 'Look inside')
    await act(async () => void s.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await click(s.host, 'Install 1 skill')
    expect(s.host.textContent).toContain('Installed find-skills')
    expect(s.host.textContent).not.toContain('does not see it yet')
  })
})
