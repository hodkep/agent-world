import { useEffect, useState } from 'react'
import { Picture } from './Images'
import { followLink, linkHint } from '../links'
import { hasMarkdown, isImagePath, splitMentions } from './format'
import { Markdown } from './markdown'

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/** Web addresses in a message are links; trailing punctuation belongs to the sentence, not the address. */
function withLinks(text: string, agentId: string) {
  return text.split(/(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} title={linkHint(part)} onClick={(e) => (e.preventDefault(), followLink(part, e, agentId))}>
        {part}
      </a>
    ) : (
      part
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

/** A message with its @file mentions shown as chips, and mentioned pictures as thumbnails above it. */
export function UserText({ agentId, text, onImage }: { agentId: string; text: string; onImage: (src: string) => void }) {
  const parts = splitMentions(text)
  const pictures = parts.filter((p) => p.file && isImagePath(p.text)).map((p) => p.text)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    for (const p of pictures)
      void window.aw.readImage(agentId, p).then((src) => alive && setThumbs((t) => (t[p] === src ? t : { ...t, [p]: src })))
    return () => {
      alive = false
    }
  }, [agentId, pictures.join('\n')])
  const words = parts.filter((p) => !p.file).map((p) => p.text).join('').trim()
  return (
    <>
      {pictures.length > 0 && (
        <div className="tc-images">
          {pictures.map((p) => (thumbs[p] === undefined ? null : <Picture key={p} src={thumbs[p]!} onOpen={onImage} label={base(p)} />))}
        </div>
      )}
      <div className="bubble">
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
