import { type ReactNode, useCallback, useRef, useState } from 'react'
import { Modal } from './Modal'

export interface ConfirmOptions {
  title: string
  body?: string
  confirm: string
  /** The action cannot be undone: the button is red. */
  danger?: boolean
}

/** A question answered inside the app (not the system's box), with Cancel focused so Enter never destroys anything. */
export function ConfirmDialog({ title, body, confirm, danger, onAnswer }: ConfirmOptions & { onAnswer: (yes: boolean) => void }) {
  return (
    <Modal label={title} className="confirm-dialog" onClose={() => onAnswer(false)}>
      <div className="cf-body">
        <b>{title}</b>
        {body && <p>{body}</p>}
        <div className="su-row">
          <button autoFocus onClick={() => onAnswer(false)}>Cancel</button>
          <button className={danger ? 'danger' : 'primary'} onClick={() => onAnswer(true)}>{confirm}</button>
        </div>
      </div>
    </Modal>
  )
}

/** `const [ask, node] = useConfirm()`: render `node` anywhere and `await ask({...})` for the answer. */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [open, setOpen] = useState<ConfirmOptions | null>(null)
  const resolve = useRef<((yes: boolean) => void) | null>(null)
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((r) => {
    resolve.current = r
    setOpen(o)
  }), [])
  const answer = (yes: boolean) => {
    resolve.current?.(yes)
    resolve.current = null
    setOpen(null)
  }
  return [ask, open ? <ConfirmDialog {...open} onAnswer={answer} /> : null]
}
