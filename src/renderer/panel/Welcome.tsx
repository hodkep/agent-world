import { PixelSprite } from './PixelSprite'
import { PixelWord } from '../PixelWord'

const ROLES = [
  { name: 'ada', role: 'senior', title: 'Senior', line: 'Takes a task and works at a desk.' },
  { name: 'grace', role: 'boss', title: 'Boss', line: 'Wears the crown while it delegates.' },
  { name: 'linus', role: 'intern', title: 'Intern', line: "A sub-agent, at the meeting table." }
] as const

/** First-run: what this place is, who works here, and the one next step. */
export function Welcome({ folder, onPick, onHire, onHistory, onCrew }: { folder: string | null; onPick: () => void; onHire: () => void; onHistory: () => void; onCrew: () => void }) {
  return (
    <section className="welcome" aria-label="Get started">
      <PixelWord text="now hiring" scale={4} />
      <p className="welcome-lead">Every agent is a real coding agent session (Claude Code or agy) with its own desk, terminal and git branch. Watch them work, step in when they ask.</p>
      <ul className="crew" aria-label="Who works here">
        {ROLES.map((r) => (
          <li key={r.name}>
            <PixelSprite name={r.name} role={r.role} scale={4} />
            <b>{r.title}</b>
            <span>{r.line}</span>
          </li>
        ))}
      </ul>
      <ol className="welcome-steps">
        <li className={folder ? 'done' : ''}>
          <span className="step-no">1</span>
          <span>{folder ? <>Working in <code>{folder.split(/[\\/]/).pop()}</code></> : 'Pick the project folder your agents will work on.'}</span>
          <button className={folder ? '' : 'primary'} onClick={onPick}>
            {folder ? 'Change' : 'Open folder…'}
          </button>
        </li>
        <li className={folder ? '' : 'later'}>
          <span className="step-no">2</span>
          <span>Hire your first agent. Choose its model and how much it may do alone.</span>
          <button className={folder ? 'primary' : ''} onClick={onHire} disabled={!folder}>
            + Agent
          </button>
        </li>
      </ol>
      {folder && (
        <button onClick={onCrew} title="Hires an Explorer, a Test writer and a Reviewer, each with its own branch and sensible permissions">
          Or hire a starter crew: Explorer, Test writer, Reviewer
        </button>
      )}
      {folder && (
        <button className="welcome-link" onClick={onHistory}>
          Or bring back an earlier conversation from this folder
        </button>
      )}
      <p className="welcome-note">Uses the agent tools you already have, signed in as you. Nothing here touches their credentials.</p>
    </section>
  )
}
