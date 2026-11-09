// The demo tour at /demo/: real screens of the app (taken by `pnpm shots`, e2e/shots.e2e.ts) with the spot to click on each.
// A spot is in % of the picture: its middle (x, y) and its size (w, h). mount() runs the page; STEPS is read by the site build for the pictures.
export const STEPS = [
  { img: 'office', part: 'The office', x: 25.9, y: 2.5, w: 4.6, h: 3.2, title: 'Every agent, at its desk', text: 'Each character is a real Claude Code or Antigravity session. What it does on the floor is what the agent is doing: thinking, running a command, waiting for you or asleep. Press + Agent to hire one.' },
  { img: 'hire', part: 'The office', x: 66.6, y: 92.5, w: 4, h: 3.2, title: 'Its own branch, its own rules', text: 'Name it, pick the program and how much it may do without asking. It works in its own git worktree on aw/ada, so agents never overwrite your files or each other\'s.' },
  { img: 'agents-panel', part: 'Steering', x: 70.1, y: 18, w: 5.4, h: 9.5, title: 'Red means it needs you', text: 'Rest on the number and every agent shows as a tile. The one waiting for you is marked: gus wants to run a command.' },
  { img: 'permission', part: 'Steering', x: 78.7, y: 77.8, w: 3.6, h: 3.2, title: 'Allow it in one click', text: 'The request is in the chat and above the character. Allow or deny without hunting for its terminal.' },
  { img: 'plan', part: 'Steering', x: 71.8, y: 69.4, w: 6.6, h: 3, title: 'Approve the plan first', text: 'In plan mode the agent shows its plan and waits. Approve it, send it back with a note, or keep planning.' },
  { img: 'code', part: 'Code', x: 88, y: 28, w: 22, h: 7, title: 'See what it changed', text: 'The Code tab shows the agent\'s branch against main, file by file, before anything is merged.' },
  { img: 'preview', part: 'Code', x: 76, y: 17.2, w: 15, h: 3.2, title: 'Its dev server, in a tab', text: 'When an agent starts a dev server, the Preview tab opens it inside the app, with desktop and phone sizes.' },
  { img: 'workflow', part: 'Workflows', x: 70, y: 44, w: 13, h: 10, title: 'A workflow it follows', text: 'With workflows on, a task runs plan, build, review and pull request. Each step is a card, and the pull request waits until you press Run.' },
  { img: 'runs', part: 'Workflows', x: 67, y: 59, w: 10, h: 5, title: 'How every run went', text: 'The Runs tab charts each run: time, your waits, commits, and how well each step was followed.' },
  { img: 'playbook', part: 'Library', x: 22, y: 51.5, w: 22, h: 6, title: 'Tell each agent what it needs', text: 'The playbook says which skill an agent is told, and when: every time, or when it is about to do a kind of work. The chat shows what it read.' },
  { img: 'skills', part: 'Library', x: 85, y: 55, w: 15, h: 12, title: 'One library for every program', text: 'Skills, instructions and prompts are kept once and handed to Claude Code and Antigravity alike, from the app or your own folders.' },
  { img: 'usage', part: 'Usage', x: 66, y: 57, w: 15, h: 9, title: 'Know what is left', text: 'Limits, spend and tokens by account, program and project, from the programs\' own reports, before you hit a wall.' },
  { img: 'storage', part: 'Usage', x: 45.5, y: 39, w: 30, h: 12, title: 'And where the disk went', text: 'The Storage tab maps what each workspace and its agents take on disk, and what could be freed.' },
  { img: 'office-off', part: 'Make it yours', x: 5, y: 8.2, w: 7, h: 3, title: 'Prefer plain? Hide the office', text: 'Press ⌘⌥O and the agents become a list beside the chat. Same agents, same controls.' },
  { img: 'look', before: 'look-before', part: 'Make it yours', x: 67.6, y: 3.4, w: 3, h: 3.2, title: 'Restyle the app by asking', text: 'Ask any agent for a theme, a layout, icons or a widget. It shows as a draft; nothing sticks until you press Keep. Hold Compare to see the look you had.' },
  { img: 'office', part: 'Done', end: true, title: 'What is different', text: '' }
]
// Facts from PRODUCT.md only: no numbers, users or ratings.
export const UNIQUE = ['It runs your agents, not just watches them: it starts each session, hooks it, and answers its prompts.', 'One worktree and branch per agent, so they work in parallel without overwriting each other.', 'Plans, permissions and pull requests wait for you, in one place.', 'Your own claude, unmodified. Nothing global in ~/.claude is changed.']

const DOWNLOAD = 'https://github.com/hodkep/agent-world/releases/latest'

/** Where the step's card goes beside its spot on a wide screen: on the side with more room, clear of the spot. */
export function tipSide(s) {
  const right = s.x < 52, below = s.y < 50
  return { left: right ? Math.min(s.x + s.w / 2 + 3, 54) : null, right: right ? null : Math.min(100 - s.x + s.w / 2 + 3, 54), top: below ? Math.min(s.y + s.h / 2 + 4, 50) : null, bottom: below ? null : Math.min(100 - s.y + s.h / 2 + 4, 50) }
}

export function mount(doc) {
  const el = (id) => doc.getElementById(id)
  const stage = el('tour'), pic = el('tour-pic'), hot = el('tour-hot'), tip = el('tour-tip'), rail = el('tour-rail'), full = el('tour-full')
  if (!stage) return
  const win = doc.defaultView, narrow = win.matchMedia('(max-width:860px)')
  const src = (img) => `${doc.body.dataset.root ?? ''}assets/docs/images/demo/${img}.jpg`
  const N = STEPS.length, parts = [...new Set(STEPS.map((s) => s.part))]
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  rail.innerHTML = parts.map((p) => `<div class="grp" data-p="${esc(p)}"><span>${esc(p)}</span><div class="dots">${STEPS.map((s, k) => (s.part === p ? `<button data-k="${k}" aria-label="Step ${k + 1}: ${esc(s.title)}"></button>` : '')).join('')}</div></div>`).join('')
  for (const s of STEPS) new win.Image().src = src(s.img)
  let i = 0
  const go = (k) => { i = Math.max(0, Math.min(N - 1, k)); show() }
  function show() {
    const s = STEPS[i]
    pic.src = src(s.img); pic.alt = s.end ? 'The office' : s.title; full.href = src(s.img)
    for (const b of rail.querySelectorAll('button')) b.className = +b.dataset.k === i ? 'on' : +b.dataset.k < i ? 'done' : ''
    for (const g of rail.querySelectorAll('.grp')) g.classList.toggle('on', g.dataset.p === s.part)
    stage.querySelector('.end')?.remove()
    stage.classList.toggle('done', !!s.end)
    const back = i ? '<button data-b>Back</button>' : ''
    if (s.end) {
      hot.hidden = tip.hidden = true
      const e = doc.createElement('div')
      e.className = 'end'
      e.innerHTML = `<div class="card"><small>The tour is done</small><h2>${esc(s.title)}</h2><ul>${UNIQUE.map((u) => `<li>${esc(u)}</li>`).join('')}</ul><div class="acts"><a class="pri" href="${DOWNLOAD}">Download for Mac</a><button data-r>Start again</button><a class="lnk" href="${doc.body.dataset.root ?? ''}docs/getting-started/">Read the guide</a></div></div>`
      stage.append(e)
    } else {
      hot.hidden = tip.hidden = false
      Object.assign(hot.style, { left: `${s.x - s.w / 2}%`, top: `${s.y - s.h / 2}%`, width: `${s.w}%`, height: `${s.h}%` })
      hot.setAttribute('aria-label', `${s.title}: next step`)
      tip.innerHTML = `<small>${esc(s.part)} · ${i + 1} of ${N - 1}</small><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="acts">${back}<button class="pri" data-n>Next</button>${s.before ? '<button data-c>Hold to compare</button>' : ''}</div>`
      if (narrow.matches) { stage.after(tip); tip.removeAttribute('style') } else {
        const t = tipSide(s), pc = (v) => (v === null ? 'auto' : `${v}%`)
        Object.assign(tip.style, { left: pc(t.left), right: pc(t.right), top: pc(t.top), bottom: pc(t.bottom) })
        stage.append(tip)
        // On a short window a long card can run past the screen's edge: it is pulled back in, 12px from that edge.
        const r = tip.getBoundingClientRect(), box = stage.getBoundingClientRect()
        if (r.top < box.top) Object.assign(tip.style, { top: '12px', bottom: 'auto' })
        else if (r.bottom > box.bottom) Object.assign(tip.style, { bottom: '12px', top: 'auto' })
      }
    }
    for (const b of doc.querySelectorAll('#tour-wrap [data-n]')) b.onclick = () => go(i + 1)
    for (const b of doc.querySelectorAll('#tour-wrap [data-b]')) b.onclick = () => go(i - 1)
    for (const b of doc.querySelectorAll('#tour-wrap [data-r]')) b.onclick = () => go(0)
    const c = doc.querySelector('#tour-wrap [data-c]')
    if (c) {
      const on = () => (pic.src = src(s.before)), off = () => (pic.src = src(s.img))
      c.onpointerdown = on; c.onpointerup = c.onpointerleave = off
      c.onkeydown = (e) => e.key === ' ' && (e.preventDefault(), on()); c.onkeyup = off
    }
  }
  hot.onclick = () => go(i + 1)
  rail.onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) go(+b.dataset.k) }
  win.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input,textarea')) return
    if (e.key === 'ArrowRight') go(i + 1)
    if (e.key === 'ArrowLeft') go(i - 1)
    if (e.key === 'Home') go(0)
  })
  narrow.addEventListener?.('change', show)
  show()
}
