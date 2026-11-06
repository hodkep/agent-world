/**
 * The question about a site on the internet that is not allowed in the Preview yet. For an address the person typed or clicked it offers the browser as the other way;
 * when an agent's browser tool asked, it names the agent, says it is waiting, and the other way is Not now.
 */
export function SiteAsk({ host, http, by, onOpen, onOther }: { host: string; http: boolean; by?: string; onOpen: () => void; onOther: () => void }) {
  return (
    <div className="preview-ask" role="group" aria-label="Open this site here?">
      <span>
        {by ? (
          <>
            <b className="ask-who">{by}</b> wants to open <b>{host}</b>, a site on the internet.
          </>
        ) : (
          <>
            <b>{host}</b> is on the internet.
          </>
        )}{' '}
        In the Preview it has no access to your files or to Agent World.{http ? ' The connection is not encrypted.' : ''}
        {by ? ` ${by} is waiting for you.` : ''}
      </span>
      <button className="primary" onClick={onOpen}>
        Open here
      </button>
      <button onClick={onOther}>{by ? 'Not now' : 'In my browser'}</button>
    </div>
  )
}
