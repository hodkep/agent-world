// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GateCard } from './GateCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('a card that asks, and folds to one line', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  const draw = async (key: string, over: { locked?: boolean; onGo?: () => void } = {}) => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () =>
      createRoot(host).render(
        <GateCard foldKey={key} label="Run Build for ada" tag="Your turn to run" title="Build" gist="Build the approved plan, and the chosen design…" buttons={<button onClick={over.onGo}>Run</button>} locked={over.locked}>
          <p>The long explanation.</p>
        </GateCard>
      )
    )
    return host
  }
  const fold = async (host: HTMLElement) => act(async () => void (host.querySelector('.pg-fold') as HTMLElement).click())

  it('is open with its explanation and buttons, and folds to a title, a gist and the same buttons', async () => {
    const onGo = vi.fn()
    const host = await draw('k1', { onGo })
    expect(host.textContent).toContain('The long explanation.')
    await fold(host)
    expect(host.textContent).not.toContain('The long explanation.')
    expect(host.querySelector('.gate-line')!.textContent).toContain('Build')
    expect(host.querySelector('.gl-gist')!.textContent).toContain('Build the approved plan')
    await act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent === 'Run')!.click())
    expect(onGo).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.pg-fold')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('stays folded for that step when drawn again, and a different step starts open', async () => {
    await fold(await draw('k2'))
    document.body.innerHTML = ''
    expect((await draw('k2')).querySelector('.gate-line')).not.toBeNull()
    document.body.innerHTML = ''
    expect((await draw('k3')).querySelector('.gate-line')).toBeNull()
  })

  it('stays open while something is being typed in it, though it was folded', async () => {
    await fold(await draw('k4'))
    document.body.innerHTML = ''
    const host = await draw('k4', { locked: true })
    expect(host.querySelector('.gate-line')).toBeNull()
    expect(host.textContent).toContain('The long explanation.')
  })

  it('offers an optional comment that goes to the buttons, empty by default', async () => {
    const seen: string[] = []
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () =>
      createRoot(host).render(
        <GateCard foldKey="k5" label="x" tag="t" title="Verify" gist="g" commentable buttons={(note) => <button onClick={() => seen.push(note)}>Approve</button>}>
          <p>Body</p>
        </GateCard>
      )
    )
    const press = async () => act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent === 'Approve')!.click())
    expect(host.querySelector('textarea')).toBeNull()
    await press()
    await act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Add a comment'))!.click())
    const box = host.querySelector('textarea')!
    expect(box.value).toBe('')
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      set.call(box, '  Looks fine.  ')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await press()
    expect(seen).toEqual(['', 'Looks fine.'])
  })

  it('a card with a comment typed in does not fold away from it', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () =>
      createRoot(host).render(
        <GateCard foldKey="k6" label="x" tag="t" title="Verify" gist="g" commentable buttons={() => <button>Approve</button>}>
          <p>Body</p>
        </GateCard>
      )
    )
    await act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Add a comment'))!.click())
    await act(async () => {
      const box = host.querySelector('textarea')!
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'Wait.')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await fold(host)
    expect(host.querySelector('.gate-line')).toBeNull()
    expect(host.querySelector('textarea')!.value).toBe('Wait.')
  })
})
