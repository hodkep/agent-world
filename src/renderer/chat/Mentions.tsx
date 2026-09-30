import { useEffect, useState } from 'react'
import { Picture } from './Images'
import { isImagePath, splitMentions } from './format'

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)

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
        {words}
      </div>
    </>
  )
}
