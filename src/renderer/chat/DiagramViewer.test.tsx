// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const pngOf = vi.fn(async () => new Blob(['x'], { type: 'image/png' }))
vi.mock('./diagramDom', () => ({ addHits() {}, showPicks() {}, pickedAt: () => null, toggled: (p: string[]) => p, pngOf: () => pngOf() }))
vi.mock('./ImageEditor', () => ({ ImageEditor: () => <div className="editor" /> }))
URL.createObjectURL = () => 'blob:x'
URL.revokeObjectURL = () => {}

import { DiagramViewer } from './DiagramViewer'

describe('a diagram opened large', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('opens the drawing tools when E is pressed', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<DiagramViewer svg="<svg/>" picked={[]} onClose={vi.fn()} onAsk={vi.fn()} onDrawn={vi.fn()} />))
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })))
    expect(host.querySelector('.editor')).not.toBeNull()
  })
})
