import { type ReactNode, useEffect, useRef } from 'react'

/** A native dialog opened as a modal, like Settings: it floats over the office with a backdrop; Esc closes it. */
export function Modal({ label, className = '', onClose, children }: { label: string; className?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => dialog.current?.showModal(), [])
  return (
    <dialog ref={dialog} className={`settings ${className}`} aria-label={label} onClose={onClose} onCancel={onClose}>
      {children}
    </dialog>
  )
}
