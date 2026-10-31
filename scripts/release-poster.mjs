// Draws a release poster (2560x1440 PNG) from a small content file, in the look of the earlier posters: the app's palette, a grid, a title and two to four cards.
//   pnpm release:poster <content.json> <out.png>      e.g. pnpm release:poster docs/images/releases/0.9.0/poster.json docs/images/releases/0.9.0/poster.png
// Content: { version, tagline, subtitle?, cards: [{ kicker, title, text, big?, bigLabel?, chips? }] (2 to 4), also?: [string] (up to 6), footer? }. See RELEASING.md.
// It needs Electron and Playwright, which the repo already has; nothing is downloaded. The text is escaped, so content cannot add markup.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A text field: a string of at most `max` characters, or refused with the field's name. */
function text(value, name, max, { optional = false } = {}) {
  if (value === undefined || value === '') {
    if (optional) return ''
    throw new Error(`${name} is needed.`)
  }
  if (typeof value !== 'string') throw new Error(`${name} must be text.`)
  if (value.length > max) throw new Error(`${name} is ${value.length} characters; at most ${max} fit.`)
  return value
}

/** The template with the content filled in. Throws, naming the field, when the content would not fit on the poster. */
export function buildPosterHtml(template, data) {
  const version = text(data?.version, 'version', 24)
  const tagline = text(data.tagline, 'tagline', 80)
  const subtitle = text(data.subtitle, 'subtitle', 140, { optional: true })
  const footer = text(data.footer, 'footer', 120, { optional: true })
  const cards = data.cards
  if (!Array.isArray(cards) || cards.length < 2 || cards.length > 4) throw new Error('A poster takes 2 to 4 cards.')
  const cardHtml = cards.map((c, i) => {
    const at = `card ${i + 1}`
    const chips = c.chips ?? []
    if (!Array.isArray(chips) || chips.length > 4) throw new Error(`${at}: at most 4 chips.`)
    const chipHtml = chips.map((x) => `<span class="pchip">${esc(text(x, `${at} chip`, 24))}</span>`).join('')
    const big = text(c.big, `${at} big`, 10, { optional: true })
    const bigHtml = big ? `<div class="pbig">${esc(big)}</div><div class="pbiglabel">${esc(text(c.bigLabel, `${at} bigLabel`, 28, { optional: true }))}</div>` : ''
    return `<div class="pcard"><div class="psub">${esc(text(c.kicker, `${at} kicker`, 24))}</div><h3>${esc(text(c.title, `${at} title`, 60))}</h3><p>${esc(text(c.text, `${at} text`, 140))}</p>${bigHtml}${chipHtml && `<div class="pchips">${chipHtml}</div>`}</div>`
  })
  const also = data.also ?? []
  if (!Array.isArray(also) || also.length > 6) throw new Error('At most 6 items in also.')
  const alsoHtml = also.length
    ? `<div class="palso"><div class="psub">Also in ${esc(version)}</div><div class="pchips">${also.map((x) => `<span class="pchip">${esc(text(x, 'also item', 48))}</span>`).join('')}</div></div>`
    : ''
  const fill = {
    version: esc(version),
    tagline: esc(tagline),
    subtitle: esc(subtitle),
    cards: `<div class="pcards" style="--n:${cards.length}">${cardHtml.join('')}</div>`,
    also: alsoHtml,
    footer: esc(footer)
  }
  return Object.entries(fill).reduce((html, [k, v]) => html.split(`{{${k}}}`).join(v), template)
}

async function render(dataPath, outPath) {
  const data = JSON.parse(readFileSync(dataPath, 'utf8'))
  const html = buildPosterHtml(readFileSync(join(HERE, 'poster-template.html'), 'utf8'), data)
  const dir = mkdtempSync(join(tmpdir(), 'aw-poster-'))
  try {
    const page = join(dir, 'poster.html')
    const main = join(dir, 'main.cjs')
    writeFileSync(page, html)
    writeFileSync(main, "const { app, BrowserWindow } = require('electron')\napp.whenReady().then(() => { const w = new BrowserWindow({ width: 2700, height: 1500, show: false }); w.loadFile(process.env.POSTER_PAGE) })\n")
    const { _electron: electron } = await import('@playwright/test')
    const app = await electron.launch({ args: [main], env: { ...process.env, POSTER_PAGE: page } })
    const win = await app.firstWindow()
    await win.waitForLoadState('load')
    // The poster is drawn at 1280x720; whatever this display's pixel ratio is, the picture comes out 2560x1440.
    await win.evaluate(() => { document.getElementById('poster').style.zoom = String(2 / window.devicePixelRatio) })
    await win.waitForTimeout(400)
    await win.locator('#poster').screenshot({ path: resolve(outPath) })
    await app.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dataPath, outPath] = process.argv.slice(2)
  if (!dataPath || !outPath) {
    console.error('Usage: pnpm release:poster <content.json> <out.png>')
    process.exit(1)
  }
  render(dataPath, outPath).then(
    () => console.log(`Poster written to ${outPath}`),
    (e) => {
      console.error(`Poster failed: ${e.message}`)
      process.exit(1)
    }
  )
}
