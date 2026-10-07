import { useEffect, useState } from 'react'
import type { PictureSet, Shot } from './gallery'
import { Gallery, Picture } from './Images'
import { followLink, linkHint } from '../links'
import { hasMarkdown, highlight, isImagePath, splitMentions } from './format'
import { type Picked, splitPicked } from './pickedContext'
import { Code, Markdown } from './markdown'
import { QuoteMark } from './QuoteMark'
import { pairQuotes } from './quotePairs'
import { type CodeBlock, splitCode } from '../code/codeContext'

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/** Commands, plugin skills and written-out paths get the same tint here as in the message box. */
const tinted = (text: string) => highlight(text).map((p, i) => (p.kind === 'plain' ? p.text : <mark key={i} className={`tok-${p.kind}`}>{p.text}</mark>))

/** Web addresses in a message are links; trailing punctuation belongs to the sentence, not the address. */
function withLinks(text: string, agentId: string) {
  return text.split(/(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} title={linkHint(part)} onClick={(e) => (e.preventDefault(), followLink(part, e, agentId))}>
        {part}
      </a>
    ) : (
      <span key={i}>{tinted(part)}</span>
    )
  )
}

/** A quote the agent said, with the words written about it: one small card; a long quote folds to three lines and opens on a click. */
function QuoteCard({ quote, note, render }: { quote: string; note: string; render: (text: string) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const long = quote.split('\n').length > 3 || quote.length > 150
  return (
    <div className="qa">
      <div className="qa-label">
        <QuoteMark />
        Quote
      </div>
      <blockquote className={`qa-q ${long && !open ? 'clamp' : ''}`} onClick={() => long && setOpen((o) => !o)} title={long ? (open ? 'Fold' : 'Show all') : undefined}>
        <span className="qt">{render(quote)}</span>
      </blockquote>
      {long && (
        <button className="qa-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
      {note && <div className="qa-note">{render(note)}</div>}
    </div>
  )
}

/** Some code from a file, sent with a message: one small card with where it is from; the code opens on a click. */
function CodeCard({ block }: { block: CodeBlock }) {
  const lang = /\.([a-z0-9]{1,5})$/i.exec(block.path)?.[1]?.toLowerCase() ?? ''
  return (
    <details className="pick-card code-card">
      <summary title={`${block.path}, ${block.lines.includes('–') ? 'lines' : 'line'} ${block.lines}`}>
        <span className="chip-from code">Code</span>
        <span className="pick-label">{block.label}</span>
        {block.note && <span className="pick-note">{block.note}</span>}
      </summary>
      <div className="pick-body">
        <Code text={block.code} lang={lang} className="pick-code" />
        {block.before && (
          <>
            <div className="pick-sub">Before the change, {block.before.lines.includes('–') ? 'lines' : 'line'} {block.before.lines}</div>
            <Code text={block.before.code} lang={lang} className="pick-code" />
          </>
        )}
      </div>
    </details>
  )
}

/** An element picked on the Preview: one small card, with its picture; what it is made of opens on a click. */
function PickCard({ pick, thumb, onImage }: { pick: Picked; thumb?: string; onImage: (src: string) => void }) {
  const rows = [['Page', pick.from], ['View', pick.view ? `${pick.view.label} ${pick.view.w}×${pick.view.h}` : ''], ['Selector', pick.selector], ['Text', pick.text], ['HTML', pick.html], ['Style', pick.style]].filter((r): r is [string, string] => !!r[1])
  return (
    <details className="pick-card">
      <summary title="Show what was picked">
        {thumb && <img className="pick-thumb" src={thumb} alt="" />}
        <span className="chip-from">Preview</span>
        {pick.view && <span className="chip-view" title={`Seen at ${pick.view.label} ${pick.view.w}×${pick.view.h}`}>{pick.view.label}</span>}
        <span className="pick-label">{pick.label}</span>
      </summary>
      <div className="pick-body">
        {thumb && <Picture src={thumb} onOpen={onImage} label="Picture of the element" />}
        <dl>
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  )
}

/** A message with its @file mentions shown as chips, mentioned pictures as thumbnails above it, and picked elements as cards. */
export function UserText({ agentId, text, onImage }: { agentId: string; text: string; onImage: (src: string, set?: PictureSet) => void }) {
  const code = splitCode(text)
  const { picks, rest } = splitPicked(code.rest)
  const parts = splitMentions(rest)
  const pictures = parts.filter((p) => p.file && isImagePath(p.text)).map((p) => p.text)
  const pickPictures = picks.flatMap((p) => (p.picture ? [p.picture] : []))
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    for (const p of [...pictures, ...pickPictures])
      void window.aw.readImage(agentId, p).then((src) => alive && setThumbs((t) => (t[p] === src ? t : { ...t, [p]: src })))
    return () => {
      alive = false
    }
  }, [agentId, pictures.join('\n'), pickPictures.join('\n')])
  // The pictures are the row above; the words are what the bubble is trimmed by.
  const shots: Shot[] = pictures.flatMap((p) => (thumbs[p] ? [{ src: thumbs[p]!, label: base(p).replace(/^\d{10,}-/, '') }] : []))
  const words = parts.filter((p) => !p.file).map((p) => p.text).join('').trim()
  const pieces = pairQuotes(words)
  return (
    <>
      {pictures.length > 0 && (
        <>
          {shots.length > 0 && <Gallery shots={shots} onOpen={(i) => onImage(shots[i]!.src, { pictures: shots, index: i })} />}
          {/* One too big to carry says where it is kept. */}
          {pictures.filter((p) => thumbs[p] === '').map((p) => <Picture key={p} src="" onOpen={onImage} label={base(p)} />)}
        </>
      )}
      <div className={`bubble ${pieces.some((p) => p.kind === 'qa') ? 'has-qa' : ''}`}>
        {code.blocks.map((b, i) => (
          <CodeCard key={`c${i}`} block={b} />
        ))}
        {picks.map((p, i) => (
          <PickCard key={i} pick={p} thumb={p.picture ? thumbs[p.picture] : undefined} onImage={onImage} />
        ))}
        {parts.filter((p) => p.file && !isImagePath(p.text)).length > 0 && (
          <span className="mention-row">
            {parts.filter((p) => p.file && !isImagePath(p.text)).map((p, i) => (
              <span key={i} className="mention" title={p.text}>
                {base(p.text) || p.text}
              </span>
            ))}
          </span>
        )}
        {pieces.map((p, i) => {
          // A little markdown (bold, italic, code, lists) reads formatted; everything else stays as typed.
          const render = (t: string) => (hasMarkdown(t) ? <Markdown text={t} agentId={agentId} /> : withLinks(t, agentId))
          if (p.kind === 'qa') return <QuoteCard key={i} quote={p.quote} note={p.note} render={render} />
          return hasMarkdown(p.text) ? (
            <div key={i} className={pieces.length > 1 ? 'md qa-free' : 'md'}>
              {render(p.text)}
            </div>
          ) : (
            <span key={i} className={pieces.length > 1 ? 'qa-free' : undefined}>
              {render(p.text)}
            </span>
          )
        })}
      </div>
    </>
  )
}
