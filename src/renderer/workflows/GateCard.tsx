import { type ReactNode, useState } from 'react'
import { OutlineIcon } from '../panel/IconButton'

// Which cards the person folded, kept while the app runs (like the plan card's): a new question has a key of its own, so it opens unfolded.
const folded = new Set<string>()

/**
 * A card that asks the person something, in the plan card's family: it folds with a chevron in its header. Folded it is one line (the tag, the title, the first words of what it says,
 * and the same buttons, which work folded or open); open it explains. A card that is being typed in (`locked`) stays open.
 */
export function GateCard({ foldKey, label, tag, title, gist, buttons, children, locked, error, tagClass, commentable }: {
  foldKey: string
  label: string
  tag: string
  title: string
  /** The first words of what the card says, shown cut short on the folded line. */
  gist: string
  /** The buttons; given the comment typed so far, when the card takes one. */
  buttons: ReactNode | ((comment: string) => ReactNode)
  /** What the open card says, above its buttons. */
  children: ReactNode
  locked?: boolean
  error?: string
  tagClass?: string
  /** The card takes an optional comment, empty by default, that goes with the button pressed. */
  commentable?: boolean
}) {
  const [fold, setFold] = useState(folded.has(foldKey))
  const set = (v: boolean) => (v ? folded.add(foldKey) : folded.delete(foldKey), setFold(v))
  const [noting, setNoting] = useState(false)
  const [comment, setComment] = useState('')
  // A card with a comment in it stays open: folding would hide what is about to be sent.
  const one = fold && !locked && comment.trim() === ''
  const acts = typeof buttons === 'function' ? buttons(comment.trim()) : buttons
  const chevron = (
    <button type="button" className="tip-btn pg-fold" aria-expanded={!one} aria-label={one ? 'Open the card' : 'Fold the card to one line'} data-tip={one ? 'Open the card' : 'Fold to one line, keep the buttons'} onClick={() => set(!fold)}>
      <OutlineIcon name="chevron" />
    </button>
  )
  if (one) {
    return (
      <section className="inline-need dialog plan-gate gate-line" aria-label={label}>
        <span className={`pg-tag ${tagClass ?? ''}`}>{tag}</span>
        <b className="gl-title">{title}</b>
        <span className="gl-gist" title={gist}>{gist}</span>
        <div className="pg-acts">{acts}</div>
        {chevron}
        {error && <p className="error gl-error" role="alert">{error}</p>}
      </section>
    )
  }
  return (
    <section className="inline-need dialog plan-gate" aria-label={label}>
      <header className="dialog-bar">
        <span className={`pg-tag ${tagClass ?? ''}`}>{tag}</span>
        <b>{title}</b>
        {chevron}
      </header>
      <div className="pg-body">
        {children}
        {commentable && !locked && (noting ? (
          <label className="pg-note">
            Comment for the agent (optional)
            <textarea rows={2} maxLength={500} value={comment} placeholder="Anything you want it to know with your answer" onChange={(e) => setComment(e.target.value)} />
          </label>
        ) : (
          <button type="button" className="su-link pg-add" onClick={() => setNoting(true)}>＋ Add a comment</button>
        ))}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="pg-acts">{acts}</div>
      </div>
    </section>
  )
}

/** The first words of a text for the folded line: its markdown marks and line breaks flattened, so it reads as one run of words. */
export const gistOf = (text: string | undefined): string => (text ?? '').replace(/[`*_#>]/g, '').replace(/\s+/g, ' ').trim()
