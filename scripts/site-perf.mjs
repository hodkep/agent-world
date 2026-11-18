// How the built home page loads on a slow network: serves the built site the way GitHub Pages does (gzip, byte ranges, a 10 minute cache),
// loads the page in Chromium with the network throttled, and prints when the first paint, the crew's script and the readable headline come, and what had arrived by then.
//   pnpm site && node scripts/site-perf.mjs [site-dist] [4G|"Fast 3G"|"Slow 3G" ...]
// Needs Chromium for Playwright (`pnpm exec playwright install chromium`); set CHROME_PATH to use another build. Not part of CI: it takes about a minute.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { createGzip } from 'node:zlib'
import { chromium } from '@playwright/test'

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' }
const TEXT = new Set(['.html', '.css', '.js', '.json', '.svg'])
// Bytes per second down and up, the round trip in ms, and what a phone's browser reports about such a line (navigator.connection; Chromium cannot report it while throttled
// from outside, so it is set for the page): the usual throttling profiles.
export const PROFILES = {
  '4G': { down: (9000 * 1024) / 8, up: (9000 * 1024) / 8, rtt: 40, conn: { effectiveType: '4g', downlink: 9, rtt: 50, saveData: false } },
  'Fast 3G': { down: (1600 * 1024) / 8, up: (750 * 1024) / 8, rtt: 150, conn: { effectiveType: '4g', downlink: 1.6, rtt: 150, saveData: false } },
  'Slow 3G': { down: (400 * 1024) / 8, up: (400 * 1024) / 8, rtt: 400, conn: { effectiveType: '3g', downlink: 0.4, rtt: 400, saveData: false } }
}

function serve(root) {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let p
      try { p = decodeURIComponent(req.url.split('?')[0]) } catch { res.writeHead(400); return res.end('bad address') }
      if (p.endsWith('/')) p += 'index.html'
      const f = join(root, p)
      // Inside the folder served, not a sibling that only starts with its name.
      if (!f.startsWith(root + sep) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found') }
      const ext = extname(f), size = statSync(f).size, head = { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'max-age=600', 'accept-ranges': 'bytes' }
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
      if (range && !TEXT.has(ext)) { const a = range[1] ? +range[1] : 0, b = range[2] ? Math.min(+range[2], size - 1) : size - 1; res.writeHead(206, { ...head, 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1 }); return createReadStream(f, { start: a, end: b }).pipe(res) }
      if (TEXT.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { res.writeHead(200, { ...head, 'content-encoding': 'gzip' }); return createReadStream(f).pipe(createGzip()).pipe(res) }
      res.writeHead(200, { ...head, 'content-length': size }); createReadStream(f).pipe(res)
    }).listen(0, '127.0.0.1', () => done({ server, url: `http://127.0.0.1:${server.address().port}/` }))
  })
}

/** One load of the page under one profile: milliseconds for each moment, and the kilobytes that had arrived by the time the page was loaded. */
export async function measure(browser, url, profile, windowMs = 60_000) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: profile.down, uploadThroughput: profile.up, latency: profile.rtt })
  const started = new Map(), done = []
  cdp.on('Network.requestWillBeSent', (e) => started.set(e.requestId, e.timestamp))
  cdp.on('Network.loadingFinished', (e) => started.has(e.requestId) && done.push({ end: e.timestamp, bytes: e.encodedDataLength }))
  await page.addInitScript((conn) => { Object.defineProperty(navigator, 'connection', { value: conn, configurable: true }) }, profile.conn)
  await page.addInitScript(() => {
    window.__fcp = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime) }).observe({ type: 'paint', buffered: true })
  })
  const t0 = Date.now(), marks = {}
  await page.goto(url, { waitUntil: 'commit', timeout: 0 }).catch(() => {})
  while (Date.now() - t0 < windowMs) {
    const s = await page.evaluate(() => {
      const vis = (el) => !!el && +getComputedStyle(el).opacity >= 0.99 && el.textContent.trim().length > 8
      return { crew: !!window.awCrew, readable: ['.street h1', '.street .lede'].every((q) => vis(document.querySelector(q))), state: document.readyState, fcp: window.__fcp, slow: document.documentElement.classList.contains('slow') }
    }).catch(() => null)
    const t = Date.now() - t0
    if (s) {
      if (s.fcp && !marks.fcp) marks.fcp = s.fcp
      if (s.crew && !marks.script) marks.script = t
      if (s.readable && !marks.readable) marks.readable = t
      if (s.state === 'complete' && !marks.load) { marks.load = t; marks.kb = Math.round(done.reduce((a, d) => a + d.bytes, 0) / 1024) }
      marks.slow = s.slow
    }
    if (marks.load && marks.readable && marks.script) break
    await page.waitForTimeout(200)
  }
  await ctx.close()
  return marks
}

const seconds = (ms) => (ms == null ? 'not in 60 s' : `${(ms / 1000).toFixed(1)} s`)
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(process.argv[2] ?? 'site-dist'), names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(PROFILES)
  if (!existsSync(join(dir, 'index.html'))) { console.error(`${dir} has no built site: run pnpm site first`); process.exit(1) }
  const { server, url } = await serve(dir)
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  console.log('| Network | First paint | Crew script ready | Headline readable | Page loaded | Weight at load |\n| --- | --- | --- | --- | --- | --- |')
  for (const name of names) {
    const m = await measure(browser, url, PROFILES[name])
    console.log(`| ${name} | ${seconds(m.fcp)} | ${seconds(m.script)} | ${seconds(m.readable)} | ${seconds(m.load)} | ${m.kb ?? '?'} KB |`)
  }
  await browser.close(); server.close()
}
