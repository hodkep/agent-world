// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentViewer } from './ImageEditor'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function mount() {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<AttachmentViewer src="data:image/png;base64,iVBORw0KGgo=" name="shot.png" onSave={vi.fn()} onClose={vi.fn()} />))
  return host
}
const press = (key: string, init: KeyboardEventInit = {}, on: EventTarget = document.body) => act(async () => void on.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init })))

describe('a picture opened large', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('has a Draw button, not an Edit one', async () => {
    const host = await mount()
    const names = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(names).toContain('Draw')
    expect(names).not.toContain('Edit')
  })

  it('opens the drawing tools when E is pressed', async () => {
    const host = await mount()
    await press('e')
    expect(host.querySelector('.editor')).not.toBeNull()
  })

  it('does not, while typing in a field or with a modifier held', async () => {
    const host = await mount()
    const field = host.appendChild(document.createElement('input'))
    await press('e', {}, field)
    await press('e', { metaKey: true })
    expect(host.querySelector('.editor')).toBeNull()
  })
})
