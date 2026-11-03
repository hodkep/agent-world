// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OfficeCheck } from '../../shared/api'
import { OfficeStrip } from './OfficeStrip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const broken: OfficeCheck = { problem: 'left-behind', program: '/gone/app', commands: ['agy mcp remove agent-world', 'agy mcp add agent-world -- /app/electron /home/bin/bridge.cjs'] }
const fine: OfficeCheck = { problem: null, commands: [] }

async function show(aw: Record<string, unknown>, agentId = 'a1') {
  ;(window as unknown as { aw: unknown }).aw = aw
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<OfficeStrip agentId={agentId} agentName="ada" visible />))
  return host
}
const click = async (host: HTMLElement, label: string) => {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent === label)
  if (!b) throw new Error(`no button ${label}`)
  await act(async () => b.click())
}

describe('the note at the top of an agy agent\'s chat when the office is out of reach', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('shows nothing when nothing is wrong', async () => {
    const host = await show({ officeCheck: vi.fn().mockResolvedValue(fine) }, 'fine')
    expect(host.textContent).toBe('')
  })

  it('says so with a Repair button, and changes nothing until Run, after the commands are shown', async () => {
    const officeRepair = vi.fn().mockResolvedValue(fine)
    const host = await show({ officeCheck: vi.fn().mockResolvedValue(broken), officeRepair }, 'c1')
    expect(host.textContent).toContain('ada cannot reach the office’s tools.')
    expect(host.textContent).toContain('names a program that is not installed')
    await click(host, 'Repair')
    expect(host.querySelector('.office-cmds')!.textContent).toBe(broken.commands.join('\n'))
    expect(officeRepair).not.toHaveBeenCalled()
    await click(host, 'Run')
    expect(officeRepair).toHaveBeenCalledWith('c1')
    expect(host.textContent).toContain('restart ada to use them')
  })

  it('offers Connect, not Repair, when agy was never connected', async () => {
    const host = await show({ officeCheck: vi.fn().mockResolvedValue({ problem: 'missing', commands: [] }) }, 'm1')
    expect(host.textContent).toContain('not connected')
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Connect'])
  })

  it('Not now goes back to the warning; Restart restarts the agent and puts the note away; a failed repair says why', async () => {
    const reconfigure = vi.fn().mockResolvedValue(undefined)
    const officeRepair = vi.fn().mockResolvedValueOnce(fine)
    const host = await show({ officeCheck: vi.fn().mockResolvedValue(broken), officeRepair, reconfigure }, 'r1')
    await click(host, 'Repair')
    await click(host, 'Not now')
    expect(host.textContent).toContain('cannot reach')
    await click(host, 'Repair')
    await click(host, 'Run')
    await click(host, 'Restart ada')
    expect(reconfigure).toHaveBeenCalledWith('r1', {})
    expect(host.textContent).toBe('')

    const bad = await show({ officeCheck: vi.fn().mockResolvedValue(broken), officeRepair: vi.fn().mockRejectedValue(new Error('agy mcp add failed')) }, 'f1')
    await click(bad, 'Repair')
    await click(bad, 'Run')
    expect(bad.textContent).toContain('agy mcp add failed')
  })

  it('Later puts it away for that agent', async () => {
    const host = await show({ officeCheck: vi.fn().mockResolvedValue(broken), officeRepair: vi.fn().mockResolvedValue(fine) }, 'l1')
    await click(host, 'Repair')
    await click(host, 'Run')
    await click(host, 'Later')
    expect(host.textContent).toBe('')
  })
})
