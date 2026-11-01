// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../../shared/runTrack'

// The little character is drawn on a canvas, which none of this needs.
vi.mock('../pixel/Pixels', () => ({ Sprite: () => null }))

import { RunTrack } from './RunTrack'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const track = (extra: Partial<Track> = {}): Track => ({ run: 'r1', title: 'Task', workflow: 'Standard', round: 1, at: 0, stations: [{ id: 'verify', name: 'Verify', kind: 'work', state: 'failed' }], ...extra }) as Track

describe('the run bar after the person refused a step', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('says Refused in a chip of its own, with the whole sentence on hover, and Ask again is a button that asks', async () => {
    const askAgain = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { workflows: { askAgain } }
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<RunTrack variant="bar" track={track({ again: 'verify', waiting: 'refused: ask again when you are ready' })} seed="a1" agentName="ada" />))
    const chip = host.querySelector('[role="status"]')!
    expect(chip.textContent).toBe('Refused')
    expect(chip.getAttribute('title')).toBe('refused: ask again when you are ready')
    const button = host.querySelector('button.rt-again') as HTMLButtonElement
    expect(button.textContent).toBe('Ask again')
    await act(async () => button.click())
    expect(askAgain.mock.calls).toEqual([['r1', 'verify']])
  })

  it('keeps the pill with the run\'s own words when nothing was refused', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<RunTrack variant="bar" track={track({ waiting: 'needs your approval' })} seed="a1" agentName="ada" />))
    expect(host.querySelector('[role="status"]')!.textContent).toBe('needs your approval')
    expect(host.querySelector('button.rt-again')).toBeNull()
  })
})
