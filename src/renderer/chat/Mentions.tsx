import { useEffect, useState } from 'react'
import { Picture } from './Images'
import { followLink, linkHint } from '../links'
import { hasMarkdown, highlight, isImagePath, splitMentions } from './format'
import { type Picked, splitPicked } from './pickedContext'
import { Markdown } from './markdown'

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

/** A message split into its quoted blocks (lines that start with "> ") and the words around them. */
export function quoted(text: string): { quote: boolean; text: string }[] {
  const out: { quote: boolean; text: string }[] = []
  for (const line of text.split('\n')) {
    const q = /^>\s?(.*)$/.exec(line)
    const last = out[out.length - 1]
    if (q) {
      if (last?.quote) last.text += `\n${q[1]}`
      else out.push({ quote: true, text: q[1]! })
    } else if (last && !last.quote) last.text += `\n${line}`
    else out.push({ quote: false, text: line })
  }
  return out.map((b) => ({ ...b, text: b.quote ? b.text : b.text.replace(/^\n+|\n+$/g, '') })).filter((b) => b.text !== '' || b.quote)
}

/** An element picked on the Preview: one small card, with its picture; what it is made of opens on a click. */
function PickCard({ pick, thumb, onImage }: { pick: Picked; thumb?: string; onImage: (src: string) => void }) {
  const rows = [['Page', pick.from], ['Selector', pick.selector], ['Text', pick.text], ['HTML', pick.html], ['Style', pick.style]].filter((r): r is [string, string] => !!r[1])
  return (
    <details className="pick-card">
      <summary title="Show what was picked">
        {thumb && <img className="pick-thumb" src={thumb} alt="" />}
        <span className="chip-from">Preview</span>
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
export function UserText({ agentId, text, onImage }: { agentId: string; text: string; onImage: (src: string) => void }) {
  const { picks, rest } = splitPicked(text)
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
  const words = parts.filter((p) => !p.file).map((p) => p.text).join('').trim()
  return (
    <>
      {pictures.length > 0 && (
        <div className="tc-images">
          {pictures.map((p) => (thumbs[p] === undefined ? null : <Picture key={p} src={thumbs[p]!} onOpen={onImage} label={base(p)} />))}
        </div>
      )}
      <div className="bubble">
        {picks.map((p, i) => (
          <PickCard key={i} pick={p} thumb={p.picture ? thumbs[p.picture] : undefined} onImage={onImage} />
        ))}
        {parts.filter((p) => p.file).length > 0 && (
          <span className="mention-row">
            {parts.filter((p) => p.file).map((p, i) => (
              <span key={i} className="mention" title={p.text}>
                {base(p.text) || p.text}
              </span>
            ))}
          </span>
        )}
        {quoted(words).map((b, i) => {
          // A little markdown (bold, italic, code, lists) reads formatted; everything else stays as typed.
          const body = hasMarkdown(b.text) ? <Markdown text={b.text} agentId={agentId} /> : withLinks(b.text, agentId)
          return b.quote ? (
            <blockquote key={i} className={`bubble-quote ${hasMarkdown(b.text) ? 'md' : ''}`}>
              {body}
            </blockquote>
          ) : hasMarkdown(b.text) ? (
            <div key={i} className="md">
              {body}
            </div>
          ) : (
            <span key={i}>{body}</span>
          )
        })}
      </div>
    </>
  )
}
