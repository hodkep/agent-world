import { type ReactNode, useEffect, useRef } from 'react'

/** Props that close a native dialog when the click both starts and ends on its backdrop (a drag that began inside it does not). */
export function closeOnBackdrop(onClose: () => void) {
  let down = false
  return {
    onMouseDown: (e: React.MouseEvent) => void (down = e.target === e.currentTarget),
    onClick: (e: React.MouseEvent) => e.target === e.currentTarget && down && onClose()
  }
}

/** A native dialog opened as a modal, like Settings: it floats over the office with a backdrop; Esc closes it. */
export function Modal({ label, className = '', onClose, children }: { label: string; className?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => dialog.current?.showModal(), [])
  return (
    <dialog ref={dialog} className={`settings ${className}`} aria-label={label} onClose={onClose} onCancel={onClose} {...closeOnBackdrop(onClose)}>
      {children}
    </dialog>
  )
}
