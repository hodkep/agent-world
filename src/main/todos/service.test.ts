import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTodoService } from './service'
import { addTodo, emptyBoard, type Actor } from '../../shared/todos'

const make = () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-todos-'))
  const changes: string[] = []
  const worked: number[] = []
  const asked: string[] = []
  const busyAgents = new Set<string>()
  const answer = { text: '{"title": "Fix the Safari login bug", "list": "Library"}' }
  const remembered: { repo: string; text: string; by: string }[] = []
  let clock = 1000
  const work = { commits: [{ sha: 'abc1234def', subject: 'fix: wire the key' }], files: ['src/b.ts'] }
  const agents: Record<string, { id: string; name: string; provider: string; repoPath: string; forMain?: string }> = {
    a1: { id: 'a1', name: 'ada', provider: 'claude', repoPath: '/work/shop' },
    b1: { id: 'b1', name: 'bob', provider: 'agy', repoPath: '/work/shop' },
    c1: { id: 'c1', name: 'cy', provider: 'claude', repoPath: '/work/other' },
    h1: { id: 'h1', name: 'helper', provider: 'agy', repoPath: '/work/shop', forMain: 'ada' }
  }
  const svc = createTodoService({
    dir,
    workspaceKey: (p) => p.split('/').pop()!,
    agent: (id) => agents[id],
    lastMessage: (id) => ({ agentId: id, itemId: `m-${id}`, at: clock, excerpt: 'Done: it works' }),
    agentNamed: (repo, name) => Object.values(agents).find((x) => x.name === name && x.repoPath === repo),
    workSince: async (_id, since) => { worked.push(since); return { commits: [...work.commits], files: [...work.files] } },
    remember: (repo, text, by) => void remembered.push({ repo, text, by }),
    pause: async () => undefined,
    busy: (id) => busyAgents.has(id),
    ask: async (prompt) => { asked.push(prompt); return answer.text },
    lastRequest: (id, text) => ({ agentId: id, itemId: `u-${id}`, at: clock, excerpt: text.slice(0, 200) }),
    now: () => (clock += 10),
    onChange: (w) => changes.push(w)
  })
  return { dir, svc, changes, worked, remembered, asked, answer, busyAgents, work }
}

describe('the todo service', () => {
  it('keeps one board per project and saves it to a file that survives a restart', () => {
    const { dir, svc } = make()
    svc.addByAgent('a1', { title: 'Add key', list: 'Manual setup', needsYou: true })
    svc.addByAgent('c1', { title: 'Other project' })
    expect(svc.board('/work/shop').todos.map((t) => t.title)).toEqual(['Add key'])
    expect(svc.board('/work/other').todos.map((t) => t.title)).toEqual(['Other project'])
    expect(readdirSync(dir).sort()).toEqual(['other.json', 'shop.json'])
    const again = createTodoService({ dir, workspaceKey: (p) => p.split('/').pop()!, agent: () => undefined, lastMessage: () => undefined, lastRequest: () => undefined, workSince: async () => ({ commits: [], files: [] }), remember: () => undefined, now: () => 1, onChange: () => undefined })
    expect(again.board('/work/shop').todos[0]).toMatchObject({ title: 'Add key', createdBy: { name: 'ada', provider: 'claude' } })
    expect(JSON.parse(readFileSync(join(dir, 'shop.json'), 'utf8')).next).toBe(2)
  })

  it('stamps an agent\'s add and finish with who made the call and the message it was in', () => {
    const { svc } = make()
    const t = svc.addByAgent('a1', { title: 'Wire the key' })
    expect(t.createdLink).toMatchObject({ agentId: 'a1', itemId: 'm-a1', excerpt: 'Done: it works' })
    svc.doneByAgent('a1', t.id, 'wired')
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'done', doneBy: { id: 'a1', name: 'ada' }, doneNote: 'wired', doneLink: { itemId: 'm-a1' } })
  })

  it('lets the person add, tick, move and clear lists, recorded as them', () => {
    const { svc, changes } = make()
    svc.addList('/work/shop', 'Tools')
    const t = svc.addByPerson('/work/shop', { title: 'By hand', list: 'Tools' })
    expect(t.createdBy).toEqual({ kind: 'human', name: 'you' })
    svc.doneByPerson('/work/shop', t.id)
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'done', doneBy: { kind: 'human' } })
    expect(svc.board('/work/shop').todos[0]!.doneLink).toBeUndefined()
    svc.reopenByPerson('/work/shop', t.id)
    svc.moveByPerson('/work/shop', t.id, 'Release', 0)
    expect(svc.board('/work/shop').lists).toEqual(['Tools', 'Release'])
    expect(changes.length).toBeGreaterThan(4)
  })

  it('lists what an agent asks for: open ones, one list, or its own', () => {
    const { svc } = make()
    svc.addByAgent('a1', { title: 'one', list: 'Tools' })
    const two = svc.addByAgent('a1', { title: 'two', list: 'Setup' })
    svc.claimByAgent('b1', two.id)
    const d = svc.addByAgent('a1', { title: 'three', list: 'Tools' })
    svc.doneByAgent('a1', d.id, '')
    expect(svc.listForAgent('a1', {}).map((t) => t.title)).toEqual(['one', 'two'])
    expect(svc.listForAgent('a1', { list: 'Tools' }).map((t) => t.title)).toEqual(['one'])
    expect(svc.listForAgent('b1', { mine: true }).map((t) => t.title)).toEqual(['two'])
    expect(svc.listForAgent('a1', { status: 'done' }).map((t) => t.title)).toEqual(['three'])
  })

  it('does not let one agent reach another project\'s board, and refuses an unknown caller', () => {
    const { svc } = make()
    const t = svc.addByAgent('a1', { title: 'shop task' })
    expect(() => svc.doneByAgent('c1', t.id, '')).toThrow(/No todo/)
    expect(() => svc.addByAgent('nobody', { title: 'x' })).toThrow(/agent/i)
  })

  it('makes a task for a request the person sent, claimed by the agent, and flags it when the turn ends unfinished', () => {
    const { svc } = make()
    const t = svc.trackRequest('a1', 'please fix the login bug on Safari')
    expect(t).toMatchObject({ title: 'fix the login bug on Safari', list: 'Inbox', status: 'doing', auto: true, createdBy: { kind: 'human' }, claimedBy: { id: 'a1' } })
    expect(t!.createdLink).toMatchObject({ agentId: 'a1' })
    svc.turnEnded('a1', { interrupted: true })
    expect(svc.board('/work/shop').todos[0]!.stale).toBe(true)
    svc.doneByAgent('a1', t!.id, 'fixed')
    svc.turnEnded('a1', { interrupted: true })
    expect(svc.board('/work/shop').todos[0]!.stale).toBeUndefined()
  })

  it('knows the task an agent is on, the one it claimed last that is not finished', () => {
    const { svc } = make()
    expect(svc.currentOf('a1')).toBeUndefined()
    const first = svc.trackRequest('a1', 'please fix the login bug on Safari')!
    expect(svc.currentOf('a1')).toBe(first.id)
    expect(svc.currentOf('b1')).toBeUndefined()
    svc.doneByAgent('a1', first.id, 'fixed')
    expect(svc.currentOf('a1')).toBeUndefined()
  })

  it('finishes the tasks of a run that are still the agent\'s and in hand when the run ends, and leaves the others alone', () => {
    const { svc } = make()
    const mine = svc.trackRequest('a1', 'please fix the login bug on Safari')!
    const theirs = svc.trackRequest('b1', 'please build a settings page for the accounts')!
    svc.finishLinked('a1', [mine.id, theirs.id, '999'], 'Redirect keeps the query string.')
    const board = svc.board('/work/shop').todos
    expect(board.find((t) => t.id === mine.id)).toMatchObject({ status: 'done', doneNote: 'Finished with its run: Redirect keeps the query string.' })
    expect(board.find((t) => t.id === theirs.id)!.status).toBe('doing')
    svc.finishLinked('a1', [mine.id], 'again')
    expect(svc.board('/work/shop').todos.find((t) => t.id === mine.id)!.doneNote).toBe('Finished with its run: Redirect keeps the query string.')
  })

  it('does not make a task for small talk, and finishes the one it made when the agent says so', () => {
    const { svc } = make()
    expect(svc.trackRequest('a1', 'thanks')).toBeUndefined()
    expect(svc.board('/work/shop').todos).toEqual([])
  })

  it('says which main agent a subagent works for, on what it adds and finishes', () => {
    const { svc } = make()
    const t = svc.addByAgent('h1', { title: 'Found a flaky test' })
    expect(t.createdBy).toMatchObject({ name: 'helper', provider: 'agy', forMain: 'ada' })
    svc.doneByAgent('h1', t.id, 'fixed')
    expect(svc.board('/work/shop').todos[0]!.doneBy).toMatchObject({ forMain: 'ada' })
  })

  it('puts an agent on a task at the person\'s request, or records a question to it, and gives back the message to send', () => {
    const { svc } = make()
    const t = svc.addByPerson('/work/shop', { title: 'Write the docs', list: 'Docs', notes: 'screenshot needed' })
    const work = svc.askAgent('/work/shop', t.id, 'b1', 'work', 'start with Settings')
    expect(work.message).toContain('todo#1')
    expect(work.message).toContain('start with Settings')
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'doing', claimedBy: { id: 'b1', name: 'bob' } })
    const q = svc.askAgent('/work/shop', t.id, 'a1', 'ask', 'is it needed?')
    expect(q.message).toMatch(/question/i)
    expect(svc.board('/work/shop').todos[0]!.claimedBy).toMatchObject({ id: 'b1' })
    expect(svc.board('/work/shop').todos[0]!.history.at(-1)).toMatchObject({ what: 'asked', note: 'ada: is it needed?' })
    expect(() => svc.askAgent('/work/shop', t.id, 'a1', 'work', '')).toThrow(/bob is already doing/)
    expect(() => svc.askAgent('/work/shop', t.id, 'nobody', 'ask', '')).toThrow(/agent/i)
  })

  it('keeps how a task was done, adds the commits git shows since it was claimed, and writes it to the shared memory', async () => {
    const { svc, worked, remembered } = make()
    const t = svc.addByAgent('a1', { title: 'Wire the key' })
    svc.claimByAgent('a1', t.id)
    svc.doneByAgent('a1', t.id, 'Key wired', { how: 'Passed it to the client.', files: ['src/a.ts'] })
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'done', doneHow: 'Passed it to the client.', doneFiles: ['src/a.ts'] })
    await svc.settled()
    const done = svc.board('/work/shop').todos[0]!
    expect(done.doneCommits).toEqual([{ sha: 'abc1234def', subject: 'fix: wire the key' }])
    expect(done.doneFiles).toEqual(['src/a.ts', 'src/b.ts'])
    expect(worked).toHaveLength(1)
    expect(worked[0]).toBeGreaterThan(1000)
    expect(remembered).toHaveLength(1)
    expect(remembered[0]).toMatchObject({ repo: '/work/shop', by: 'ada' })
    expect(remembered[0]!.text).toContain('todo#1')
    expect(remembered[0]!.text).toContain('Passed it to the client.')
    expect(remembered[0]!.text).toContain('abc1234')
  })

  it('writes no memory for a task finished with nothing to say, and survives git failing', async () => {
    const { svc, remembered, dir } = make()
    const quiet = createTodoService({ dir, workspaceKey: (p) => p.split('/').pop()!, agent: () => ({ id: 'a1', name: 'ada', provider: 'claude', repoPath: '/work/quiet' }), lastMessage: () => undefined, lastRequest: () => undefined, workSince: async () => { throw new Error('not a repo') }, remember: (r, t, b) => void remembered.push({ repo: r, text: t, by: b }), now: () => 5, onChange: () => undefined })
    const t = quiet.addByAgent('a1', { title: 'Plain' })
    quiet.doneByAgent('a1', t.id, '')
    await quiet.settled()
    expect(quiet.board('/work/quiet').todos[0]).toMatchObject({ status: 'done' })
    expect(remembered).toHaveLength(0)
    void svc
  })

  it('searches the project\'s tasks for an agent, done ones included', async () => {
    const { svc } = make()
    const a = svc.addByAgent('a1', { title: 'Fix the flaky login test' })
    svc.doneByAgent('a1', a.id, 'Waited for the cookie banner', { how: 'Detach before click' })
    svc.addByAgent('a1', { title: 'Write the changelog' })
    await svc.settled()
    expect(svc.searchForAgent('b1', 'cookie banner', {}).map((h) => h.todo.id)).toEqual([a.id])
    expect(svc.searchForAgent('c1', 'cookie banner', {})).toEqual([])
  })

  it('points an agent at a finished task that looks like its request, once in a while, never at itself', async () => {
    const { svc } = make()
    const a = svc.addByAgent('a1', { title: 'Wire the Anthropic key into the Settings accounts page' })
    svc.doneByAgent('a1', a.id, 'Added the key field and a test connection', { how: 'Settings → Accounts' })
    await svc.settled()
    const first = svc.similarDone('b1', 'please wire the anthropic key into settings accounts')
    expect(first.map((h) => h.id)).toEqual([a.id])
    expect(svc.similarDone('b1', 'please wire the anthropic key into settings accounts')).toEqual([])
    expect(svc.similarDone('b1', 'rename the lamp post')).toEqual([])
    expect(svc.similarDone('c1', 'wire the anthropic key into settings accounts')).toEqual([])
  })

  it('keeps the board to a few lists by area: an agent\'s list name is matched to an existing one, a generic one is refused, and too many are refused', () => {
    const { svc } = make()
    svc.addByAgent('a1', { title: 'one', list: 'Library' })
    svc.addByAgent('a1', { title: 'two', list: 'library' })
    svc.addByAgent('a1', { title: 'three', list: 'Libraries' })
    expect(svc.board('/work/shop').lists).toEqual(['Library'])
    expect(() => svc.addByAgent('a1', { title: 'x', list: 'Misc' })).toThrow(/area/i)
    expect(() => svc.addByAgent('a1', { title: 'x', list: 'Requests' })).toThrow(/Library/)
    for (const l of ['Canvas', 'Release', 'Terminal', 'Settings', 'Agents', 'Usage', 'Chat', 'Providers', 'Workflows', 'Preview', 'Code']) svc.addByAgent('a1', { title: l, list: l })
    expect(svc.board('/work/shop').lists).toHaveLength(12)
    expect(() => svc.addByAgent('a1', { title: 'y', list: 'Brand new area' })).toThrow(/already has 12 lists/)
    expect(svc.addByAgent('a1', { title: 'z', list: 'canvas' }).list).toBe('Canvas')
    expect(svc.listsOf('a1')).toHaveLength(12)
  })

  it('a task added with no list waits in the Inbox, and an agent names and sorts it with an update or when it finishes', () => {
    const { svc } = make()
    const t = svc.addByAgent('a1', { title: 'the thing' })
    expect(t.list).toBe('Inbox')
    const u = svc.updateByAgent('a1', t.id, { title: 'Wire the Anthropic key', list: 'Library' })
    expect(u).toMatchObject({ title: 'Wire the Anthropic key', list: 'Library' })
    const r = svc.trackRequest('b1', 'please build a settings page for the accounts')!
    expect(r.list).toBe('Inbox')
    const d = svc.doneByAgent('b1', r.id, 'Built it', { title: 'Settings page for accounts', list: 'library' })
    expect(d).toMatchObject({ status: 'done', title: 'Settings page for accounts', list: 'Library' })
    expect(svc.listsOf('a1')).toEqual(['Library'])
  })

  it('does not make a second task for the same request while the first is still open', () => {
    const { svc } = make()
    const a = svc.trackRequest('a1', 'they got this error when they opened the page')!
    const b = svc.trackRequest('a1', 'they got this error when they opened the page')!
    expect(b.id).toBe(a.id)
    expect(svc.board('/work/shop').todos).toHaveLength(1)
  })

  it('a git instruction and an approval make no task', () => {
    const { svc } = make()
    expect(svc.trackRequest('a1', 'commit those and merge to main')).toBeUndefined()
    expect(svc.trackRequest('a1', 'these are good, lets implement these.')).toBeUndefined()
  })

  it('closes the task made for a request when the agent\'s turn ends cleanly, and flags it only when the turn was cut off', async () => {
    const { svc } = make()
    const a = svc.trackRequest('a1', 'please fix the login bug on Safari')!
    svc.turnEnded('a1')
    await svc.settled()
    expect(svc.board('/work/shop').todos.find((t) => t.id === a.id)).toMatchObject({ status: 'done', closedAtTurnEnd: true, closedBy: 'turn', doneBy: { id: 'a1' } })
    expect(svc.board('/work/shop').todos.find((t) => t.id === a.id)!.doneLink).toMatchObject({ agentId: 'a1' })
    const b = svc.trackRequest('a1', 'now add a health check endpoint to the server')!
    svc.turnEnded('a1', { interrupted: true })
    expect(svc.board('/work/shop').todos.find((t) => t.id === b.id)).toMatchObject({ status: 'doing', stale: true })
  })

  it('names and sorts a task the agent left with the person\'s words: a small model is asked once, and the answer sets its title and list', async () => {
    const { svc, asked } = make()
    const a = svc.trackRequest('a1', 'please fix the login bug on Safari')!
    svc.turnEnded('a1')
    await svc.settled()
    const t = svc.board('/work/shop').todos.find((x) => x.id === a.id)!
    expect(t).toMatchObject({ title: 'Fix the Safari login bug', list: 'Library', named: true })
    expect(svc.board('/work/shop').lists).toContain('Library')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('login bug on Safari')
    // Done again, or ended again, it is not asked about again.
    svc.turnEnded('a1')
    await svc.settled()
    expect(asked).toHaveLength(1)
    expect(svc.board('/work/shop').todos.find((x) => x.id === a.id)!.history.at(-1)).toMatchObject({ what: 'moved', by: { name: 'app' } })
  })

  it('leaves a task alone that an agent already named, and survives a model that answers badly or not at all', async () => {
    const { svc, asked, answer } = make()
    const a = svc.trackRequest('a1', 'please fix the login bug on Safari')!
    svc.updateByAgent('a1', a.id, { title: 'Fix the Safari login bug', list: 'Library' })
    svc.turnEnded('a1')
    await svc.settled()
    expect(asked).toHaveLength(0)
    answer.text = 'no idea'
    const b = svc.trackRequest('a1', 'now add a health check endpoint to the server')!
    svc.turnEnded('a1')
    await svc.settled()
    expect(svc.board('/work/shop').todos.find((t) => t.id === b.id)).toMatchObject({ status: 'done', list: 'Inbox', title: 'now add a health check endpoint to the server' })
  })

  it('sorts everything waiting in the Inbox when asked, and says how many it named', async () => {
    const { svc } = make()
    svc.trackRequest('a1', 'please fix the login bug on Safari')
    svc.trackRequest('b1', 'build a settings page for the accounts')
    expect(await svc.tidyInbox('/work/shop')).toBe(2)
    expect(svc.board('/work/shop').todos.every((t) => t.named && t.list === 'Library')).toBe(true)
    expect(await svc.tidyInbox('/work/shop')).toBe(0)
  })

  it('when asked to sort the Inbox it also closes requests left open by agents that are not working now, and not those still working', async () => {
    const { svc, busyAgents } = make()
    const old = svc.trackRequest('a1', 'please fix the login bug on Safari')!
    const live = svc.trackRequest('b1', 'build a settings page for the accounts')!
    busyAgents.add('b1')
    expect(await svc.tidyInbox('/work/shop')).toBe(2)
    const board = svc.board('/work/shop').todos
    expect(board.find((t) => t.id === old.id)).toMatchObject({ status: 'done', closedAtTurnEnd: true, named: true })
    expect(board.find((t) => t.id === live.id)).toMatchObject({ status: 'doing', named: true })
  })

  it('counts what needs the person, per project', () => {
    const { svc } = make()
    svc.addByAgent('a1', { title: 'key', needsYou: true })
    svc.addByAgent('a1', { title: 'other' })
    expect(svc.needsYou('/work/shop')).toBe(1)
    expect(svc.needsYou('/work/other')).toBe(0)
  })

  it('survives a damaged file by starting an empty board rather than failing', () => {
    const { dir, svc } = make()
    writeFileSync(join(dir, 'shop.json'), '{not json')
    expect(svc.board('/work/shop')).toMatchObject({ lists: [], todos: [] })
  })
})

describe('a board made before tasks were sorted by area', () => {
  it('moves what the app made for requests out of "Requests" into the Inbox and names each by its own words, leaving the rest alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aw-todos-old-'))
    const you: Actor = { kind: 'human', name: 'you' }
    let b = addTodo(emptyBoard(), { title: '> should the wall bookshelf open a new panel', list: 'Requests', auto: true }, you, 1, { agentId: 'a1', itemId: 'u1', at: 1, excerpt: '> should the wall bookshelf open a new panel (my suggestion)\n\nyes, a panel, and show the shelves as tabs' }).board
    b = addTodo(b, { title: 'Written by hand', list: 'Requests' }, you, 2).board
    b = addTodo(b, { title: 'Kept in place', list: 'Setup' }, you, 3).board
    writeFileSync(join(dir, 'shop.json'), JSON.stringify(b))
    const svc = createTodoService({ dir, workspaceKey: (p) => p.split('/').pop()!, agent: () => undefined, lastMessage: () => undefined, lastRequest: () => undefined, workSince: async () => ({ commits: [], files: [] }), remember: () => undefined, now: () => 5, onChange: () => undefined })
    const out = svc.board('/work/shop')
    expect(out.todos.map((t) => [t.title, t.list])).toEqual([['a panel, and show the shelves as tabs', 'Inbox'], ['Written by hand', 'Requests'], ['Kept in place', 'Setup']])
    expect(out.lists).toEqual(['Requests', 'Setup', 'Inbox'])
    // It is saved, so it is only done once.
    expect(JSON.parse(readFileSync(join(dir, 'shop.json'), 'utf8')).todos[0].list).toBe('Inbox')
  })

  it('records a request another agent sent as made by that agent, and a reply to a message of yours as no request', () => {
    const { svc } = make()
    const mail = '[Agent World] Message from bob: please add a health check endpoint to the server\n\nWhen you have an answer, reply using the agent-world send_message tool with to="bob" and expects_reply=false.'
    const t = svc.trackRequest('a1', mail)!
    expect(t.createdBy).toMatchObject({ kind: 'agent', name: 'bob', provider: 'agy', id: 'b1' })
    expect(t.title).toBe('add a health check endpoint to the server')
    expect(svc.trackRequest('a1', '[Agent World] Message from bob: here is the answer to your question about the build\n\nThis is a reply to you. No reply is needed; carry on with your task.')).toBeUndefined()
  })

  it('makes no task for what the system sent: a background task finishing, a hook, a command', () => {
    const { svc } = make()
    expect(svc.trackRequest('a1', '<task-notification>\n<task-id>bvw4cqgjx</task-id>\n<status>completed</status>\n</task-notification>')).toBeUndefined()
    expect(svc.trackRequest('a1', '<system-reminder>something the harness added to the conversation for you</system-reminder>')).toBeUndefined()
    expect(svc.trackRequest('a1', '<command-name>/compact</command-name> compact the conversation now please')).toBeUndefined()
    expect(svc.board('/work/shop').todos).toHaveLength(0)
  })

  it('drops the task of a request that was only talked about: no one named it and nothing was changed', async () => {
    const { svc, work } = make()
    work.commits = []
    work.files = []
    const q = svc.trackRequest('a1', 'why is this error shown in the preview tab')!
    svc.turnEnded('a1')
    await svc.settled()
    expect(svc.board('/work/shop').todos.find((t) => t.id === q.id)).toBeUndefined()
    // an agent that named it (it is work or research) keeps it, with or without changes
    const r = svc.trackRequest('a1', 'research how other apps show skipped items')!
    svc.updateByAgent('a1', r.id, { title: 'Research how other apps show skipped items' })
    svc.turnEnded('a1')
    await svc.settled()
    expect(svc.board('/work/shop').todos.find((t) => t.id === r.id)).toMatchObject({ status: 'done', title: 'Research how other apps show skipped items' })
    // changes make it work
    work.files = ['src/main/library/service.ts']
    const w = svc.trackRequest('a1', 'build the new stats row for passed over items')!
    svc.turnEnded('a1')
    await svc.settled()
    expect(svc.board('/work/shop').todos.find((t) => t.id === w.id)).toMatchObject({ status: 'done' })
  })

  it('sorts a finished task by the feature its files are in, before asking a model, and the model only chooses among areas', async () => {
    const { svc, work, asked, answer } = make()
    work.files = ['src/main/library/service.ts', 'src/main/library/situations.ts', 'e2e/library-situations.e2e.ts']
    answer.text = '{"title": "Point agents at skills when a merge conflict shows up", "list": "Application"}'
    const a = svc.trackRequest('a1', 'point the agent at the skill when a merge conflict shows up')!
    svc.turnEnded('a1')
    await svc.settled()
    expect(svc.board('/work/shop').todos.find((t) => t.id === a.id)).toMatchObject({ list: 'Library', title: 'Point agents at skills when a merge conflict shows up' })
    expect(asked[0]).toContain('Library')
    // another feature gets its own list, not the same catch-all
    work.files = ['src/main/todos/service.ts', 'src/shared/todos.ts']
    answer.text = '{"title": "Drop chat-only requests from the board", "list": "Application"}'
    const b = svc.trackRequest('a1', 'drop the tasks for chat only requests from the board')!
    svc.turnEnded('a1')
    await svc.settled()
    expect(svc.board('/work/shop').todos.find((t) => t.id === b.id)!.list).toBe('Todos')
    expect(svc.board('/work/shop').lists).toEqual(expect.arrayContaining(['Library', 'Todos']))
  })

  it('closes a request left open by an agent that has stopped, when the board is opened, and re-files the old catch-all list by files', async () => {
    const { dir, svc } = make()
    const a = svc.trackRequest('a1', 'build the settings page for the accounts')!
    expect(svc.board('/work/shop').todos.find((t) => t.id === a.id)!.status).toBe('doing')
    expect(svc.sweep('/work/shop')).toBe(1)
    expect(svc.board('/work/shop').todos.find((t) => t.id === a.id)).toMatchObject({ status: 'done', closedAtTurnEnd: true, closedBy: 'stopped' })
    // an agent still working keeps its task open
    const { svc: s2, busyAgents } = make()
    const b = s2.trackRequest('a1', 'build the settings page for the accounts')!
    busyAgents.add('a1')
    expect(s2.sweep('/work/shop')).toBe(0)
    expect(s2.board('/work/shop').todos.find((t) => t.id === b.id)!.status).toBe('doing')
    // an old board: "Application" holds what was finished in it; each goes where its files are, the rest to the Inbox, and system messages go
    const board = emptyBoard()
    board.lists = ['Inbox', 'Application']
    const old = { ...addTodo(board, { title: 'Add situations', list: 'Application' }, { kind: 'human', name: 'you' }, 1).board }
    old.todos[0]!.status = 'done'
    old.todos[0]!.doneFiles = ['src/main/library/service.ts']
    const more = addTodo(old, { title: 'Explain things', list: 'Application' }, { kind: 'human', name: 'you' }, 2)
    const noise = addTodo(more.board, { title: 'bvw4cqgjx', list: 'Inbox', auto: true }, { kind: 'human', name: 'you' }, 3, { agentId: 'a1', itemId: 'x', at: 3, excerpt: '<task-notification>\n<task-id>bvw4cqgjx</task-id>' })
    writeFileSync(join(dir, 'migrated.json'), JSON.stringify(noise.board))
    const m = createTodoService({ dir, workspaceKey: (p) => p.split('/').pop()!, agent: () => undefined, lastMessage: () => undefined, lastRequest: () => undefined, workSince: async () => ({ commits: [], files: [] }), remember: () => undefined, now: () => 1, onChange: () => undefined })
    const got = m.board('/work/migrated')
    expect(got.lists).not.toContain('Application')
    expect(got.todos.find((t) => t.title === 'Add situations')!.list).toBe('Library')
    expect(got.todos.find((t) => t.title === 'Explain things')!.list).toBe('Inbox')
    expect(got.todos.find((t) => t.title === 'bvw4cqgjx')).toBeUndefined()
  })

  it('acts on many tasks at once as the person: done, reopen, needs you, move, remove, and says how many changed', () => {
    const { svc } = make()
    const t = ['a', 'b', 'c', 'd'].map((title) => svc.addByPerson('/work/shop', { title, list: 'Library' }))
    const ids = t.map((x) => x.id)
    expect(svc.bulkByPerson('/work/shop', ids.slice(0, 3), { do: 'done' })).toBe(3)
    expect(svc.board('/work/shop').todos.filter((x) => x.status === 'done').map((x) => x.title)).toEqual(['a', 'b', 'c'])
    // done again changes nothing; reopen only touches finished ones
    expect(svc.bulkByPerson('/work/shop', ids.slice(0, 3), { do: 'done' })).toBe(0)
    expect(svc.bulkByPerson('/work/shop', ids, { do: 'reopen' })).toBe(3)
    expect(svc.bulkByPerson('/work/shop', ids.slice(0, 2), { do: 'needsYou', on: true })).toBe(2)
    expect(svc.board('/work/shop').todos.filter((x) => x.needsYou).map((x) => x.title)).toEqual(['a', 'b'])
    expect(svc.bulkByPerson('/work/shop', ids.slice(1, 3), { do: 'move', list: 'Chat' })).toBe(2)
    const b = svc.board('/work/shop')
    expect(b.todos.filter((x) => x.list === 'Chat').map((x) => x.title)).toEqual(['b', 'c'])
    expect(b.lists).toContain('Chat')
    expect(svc.bulkByPerson('/work/shop', [ids[0]!, 'nope'], { do: 'remove' })).toBe(1)
    expect(svc.board('/work/shop').todos.map((x) => x.title)).toEqual(['b', 'c', 'd'])
  })

  it('keeps a scratch pad per project in a file, makes tasks from its checklist lines, removes only those lines, and can undo', () => {
    const { dir, svc } = make()
    expect(svc.pad('/work/shop')).toBe('')
    svc.setPad('/work/shop', '## Chat\n- [ ] show the slip\n  with a note\n- [x] already finished\nhalf a thought\n')
    expect(readFileSync(join(dir, 'shop.pad.md'), 'utf8')).toContain('show the slip')
    const made = svc.padToTasks('/work/shop')
    expect(made).toHaveLength(2)
    const b = svc.board('/work/shop')
    expect(b.todos.map((t) => [t.title, t.list, t.status, t.notes, t.createdBy.name])).toEqual([['show the slip', 'Chat', 'open', 'with a note', 'you'], ['already finished', 'Chat', 'done', '', 'you']])
    expect(svc.pad('/work/shop')).toBe('## Chat\nhalf a thought\n')
    // another make finds nothing new
    expect(svc.padToTasks('/work/shop')).toEqual([])
    // undo removes what it made (untouched) and puts the lines back at the top of the pad
    expect(svc.undoPad('/work/shop')).toBe(2)
    expect(svc.board('/work/shop').todos).toHaveLength(0)
    expect(svc.pad('/work/shop')).toBe('## Chat\n- [ ] show the slip\n  with a note\n- [x] already finished\nhalf a thought\n')
    expect(svc.undoPad('/work/shop')).toBe(0)
  })

  it('does not undo a task someone has started working on', () => {
    const { svc } = make()
    svc.setPad('/work/shop', '- [ ] one\n- [ ] two\n')
    const [one] = svc.padToTasks('/work/shop')
    svc.claimByAgent('a1', one!.id)
    expect(svc.undoPad('/work/shop')).toBe(1)
    expect(svc.board('/work/shop').todos.map((t) => t.title)).toEqual(['one'])
    expect(svc.pad('/work/shop')).toBe('- [ ] two\n')
  })

  it('lets an agent use a list that already exists even when its word would be a catch-all elsewhere (an area named from files, like Todos)', () => {
    const { svc } = make()
    svc.addByPerson('/work/shop', { title: 'seed', list: 'Todos' })
    expect(svc.addByAgent('a1', { title: 'in the todos list', list: 'Todos' }).list).toBe('Todos')
    expect(svc.addByAgent('a1', { title: 'plural', list: 'todos' }).list).toBe('Todos')
    // a new list with that word is still refused
    const { svc: other } = make()
    expect(() => other.addByAgent('a1', { title: 'x', list: 'Todos' })).toThrow(/area/i)
  })

  it('lets an agent put a task under an umbrella and give it labels, and the person manage the labels of the board', () => {
    const { svc } = make()
    const u = svc.addByAgent('a1', { title: 'Umbrella', list: 'Chat' })
    const t = svc.addByAgent('a1', { title: 'Part', parent: u.id, labels: ['chat', 'bug'] })
    expect(svc.board('/work/shop').todos.find((x) => x.id === t.id)).toMatchObject({ parent: u.id, list: 'Chat', labels: ['chat', 'bug'] })
    const x = svc.updateByAgent('a1', t.id, { labels: ['bug'] })
    expect(x.labels).toEqual(['bug'])
    svc.renameLabelByPerson('/work/shop', 'bug', 'defect')
    svc.recolorLabelByPerson('/work/shop', 'defect', 'violet')
    expect(svc.board('/work/shop').labels).toEqual([{ name: 'chat', color: 'cyan' }, { name: 'defect', color: 'violet' }])
    expect(svc.board('/work/shop').todos.find((y) => y.id === t.id)!.labels).toEqual(['defect'])
    svc.addLabelByPerson('/work/shop', 'release', 'green')
    svc.removeLabelByPerson('/work/shop', 'defect')
    expect(svc.board('/work/shop').labels!.map((l) => l.name)).toEqual(['chat', 'release'])
    expect(svc.board('/work/shop').todos.find((y) => y.id === t.id)!.labels).toBeUndefined()
  })
})
