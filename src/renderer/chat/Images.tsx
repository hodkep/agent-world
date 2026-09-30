import { useEffect } from 'react'

/** A picture in the conversation. Clicking opens it full size; a picture too big to carry says where it is. */
export function Picture({ src, onOpen, label = 'Picture' }: { src: string; onOpen: (src: string) => void; label?: string }) {
  if (!src) return <div className="pic missing">{label} is too large to show here. It is kept in the saved conversation.</div>
  return (
    <button className="pic" onClick={() => onOpen(src)} aria-label={`${label}: open full size`}>
      <img src={src} alt="" />
    </button>
  )
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <div className="lightbox" role="dialog" aria-label="Picture" onClick={onClose}>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} className="lightbox-x" aria-label="Close" />
    </div>
  )
}
