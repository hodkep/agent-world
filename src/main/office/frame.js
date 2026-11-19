/* The Office viewer, running inside a sandboxed frame with no network. It reads an untrusted file, so it only draws it and reports a
   selection or a search count to the app; links never open and nothing in the file runs. */
(function () {
  'use strict'
  var MAX_CELLS = 500
  var MAX_ROWS = 2000
  var MAX_COLS = 60
  var MAX_SHEETS = 50
  var app = document.getElementById('app')
  var bubble = document.createElement('div')
  bubble.className = 'bub'
  bubble.hidden = true
  document.body.appendChild(bubble)

  var st = { kind: '', name: '', csv: false, sheets: [], sheet: 0, leftOut: 0, table: null, rect: null, drag: null, words: '', where: '', root: null, hits: [], hit: 0, q: '', selecting: false, zoom: 1, anchor: null, dim: { rows: 0, cols: 0 } }

  function post(m) {
    parent.postMessage(m, '*')
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  function note(text, bad) {
    app.innerHTML = '<div class="note' + (bad ? ' bad' : '') + '">' + esc(text) + '</div>'
  }
  var libs = {}
  function lib(file) {
    // Each script is added once, however many files are opened in this frame.
    return (libs[file] = libs[file] || new Promise(function (ok, bad) {
      var s = document.createElement('script')
      s.src = file
      s.onload = ok
      s.onerror = function () {
        bad(new Error('Could not load ' + file))
      }
      document.head.appendChild(s)
    }))
  }
  function letters(n) {
    var s = ''
    for (var k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s
    return s
  }

  /* ---- the bubble and the selection ---- */
  function setSelecting(on) {
    if (st.selecting !== on) {
      st.selecting = on
      post({ t: 'selection', on: on })
    }
  }
  function showBubble(text, rect, below) {
    bubble.textContent = text
    bubble.hidden = false
    var w = bubble.offsetWidth
    var x = Math.max(6, Math.min(rect.left, window.innerWidth - w - 6))
    var top = Math.max(rect.top, 0)
    var bottom = Math.min(rect.bottom, window.innerHeight)
    var y = top - 40
    var under = y < 4 || below
    if (under) y = Math.min(bottom + 10, window.innerHeight - 36)
    bubble.className = 'bub' + (under ? ' under' : '')
    bubble.style.left = x + 'px'
    bubble.style.top = y + 'px'
  }
  function clearSelection() {
    bubble.hidden = true
    st.words = ''
    st.where = ''
    clearCells()
    var sel = window.getSelection()
    if (sel) sel.removeAllRanges()
    setSelecting(false)
  }
  bubble.addEventListener('mousedown', function (e) {
    e.preventDefault()
  })
  bubble.addEventListener('click', function () {
    send()
  })

  function slideOf(node) {
    var n = node && node.nodeType === 3 ? node.parentNode : node
    while (n && n !== document.body) {
      if (n.getAttribute && n.getAttribute('data-slide')) return Number(n.getAttribute('data-slide'))
      n = n.parentNode
    }
    return 0
  }
  function wordsChanged() {
    if (st.kind === 'sheet') return
    var sel = window.getSelection()
    var text = sel ? sel.toString().trim() : ''
    if (!text || !sel.rangeCount || !app.contains(sel.anchorNode)) {
      bubble.hidden = true
      st.words = ''
      return setSelecting(false)
    }
    st.words = text
    st.where = st.kind === 'slides' && slideOf(sel.anchorNode) ? 'slide ' + slideOf(sel.anchorNode) : ''
    showBubble('Add selection to message', sel.getRangeAt(0).getBoundingClientRect())
    setSelecting(true)
  }
  document.addEventListener('mouseup', function () {
    setTimeout(wordsChanged, 0)
  })
  // A key with a modifier goes up to the app, so its shortcuts (add the selection, switch tab) work while the focus is in here.
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      return selectAll()
    }
    if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') return
    if (e.metaKey || e.ctrlKey || e.altKey) post({ t: 'key', key: e.key, code: e.code, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey })
  })
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Escape') clearSelection()
    else if (e.shiftKey) wordsChanged()
  })
  // A link in a file never opens anything.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null
    if (a) e.preventDefault()
  })

  /* ---- what the app is told when the person adds the selection ---- */
  function send() {
    if (st.rect) {
      var r = norm(st.rect)
      var rows = st.sheets[st.sheet].rows
      var cols = r.c2 - r.c1 + 1
      var keep = Math.min(r.r2 - r.r1 + 1, Math.max(1, Math.floor(MAX_CELLS / cols)))
      var cut = function (row) {
        var out = []
        for (var c = r.c1; c <= r.c2; c++) out.push(String((row && row[c]) || ''))
        return out
      }
      var body = []
      for (var i = 0; i < keep; i++) body.push(cut(rows[r.r1 + i]))
      post({ t: 'cells', sheet: st.csv ? '' : st.sheets[st.sheet].name, r1: r.r1, c1: r.c1, r2: r.r2, c2: r.c2, header: cut(rows[0]), rows: body })
    } else if (st.words) {
      var m = { t: 'words', text: st.words.slice(0, 50000) }
      if (st.where) m.where = st.where
      post(m)
    } else return
    clearSelection()
  }

  /* ---- Excel and CSV ---- */
  function norm(r) {
    return { r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) }
  }
  function cellAt(r, c) {
    var row = st.table && st.table.tBodies[0].rows[r]
    return row ? row.cells[c + 1] : null
  }
  function clearCells() {
    if (st.table) Array.prototype.forEach.call(st.table.querySelectorAll('td.sel'), function (td) { td.classList.remove('sel') })
    st.rect = null
  }
  function paint() {
    if (!st.table || !st.rect) return
    Array.prototype.forEach.call(st.table.querySelectorAll('td.sel'), function (td) { td.classList.remove('sel') })
    var r = norm(st.rect)
    for (var i = r.r1; i <= r.r2; i++) for (var j = r.c1; j <= r.c2; j++) {
      var td = cellAt(i, j)
      if (td) td.classList.add('sel')
    }
  }
  function cellBubble() {
    var r = norm(st.rect)
    var a = cellAt(r.r1, r.c1)
    var b = cellAt(r.r2, r.c2)
    if (!a || !b) return
    var ra = a.getBoundingClientRect()
    var rb = b.getBoundingClientRect()
    var n = (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1)
    var label = n === 1 ? 'Add cell to message' : 'Add ' + (r.r2 - r.r1 + 1) + '×' + (r.c2 - r.c1 + 1) + ' cells to message'
    showBubble(label, { left: ra.left, top: ra.top, bottom: rb.bottom })
    setSelecting(true)
  }
  function selectAll() {
    if (st.kind === 'sheet') {
      if (!st.table || !st.dim.rows) return
      st.rect = { r1: 0, c1: 0, r2: st.dim.rows - 1, c2: st.dim.cols - 1 }
      st.anchor = { r: 0, c: 0 }
      paint()
      return cellBubble()
    }
    if (!st.root) return
    var r = document.createRange()
    r.selectNodeContents(st.root)
    var sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    wordsChanged()
  }
  function drawSheet(i) {
    st.sheet = i
    clearSelection()
    var s = st.sheets[i]
    if (!s.rows) {
      s.rows = XLSX.utils.sheet_to_json(s.ws, { header: 1, raw: false, defval: '', blankrows: true }).map(function (r) { return r.map(String) })
      s.ws = null
    }
    var cols = 0
    s.rows.forEach(function (r) { cols = Math.max(cols, r.length) })
    st.dim = { rows: s.rows.length, cols: cols }
    var wrap = app.querySelector('.grid-wrap')
    var blank = !s.rows.some(function (r) { return r.some(function (c) { return c !== '' }) })
    var more = st.leftOut > 0 ? '<div class="cut">Only the first ' + MAX_SHEETS + ' sheets are shown; ' + st.leftOut + ' more are left out.</div>' : ''
    if (blank || !cols) {
      wrap.innerHTML = '<div class="note">This sheet is empty.</div>' + more
      st.table = null
      st.root = wrap
    } else {
      var h = '<table class="g"><thead><tr><th></th>'
      for (var c = 0; c < cols; c++) h += '<th data-col="' + c + '">' + letters(c) + '</th>'
      h += '</tr></thead><tbody>'
      s.rows.forEach(function (row, ri) {
        h += '<tr><td class="rh" data-row="' + ri + '">' + (ri + 1) + '</td>'
        for (var cc = 0; cc < cols; cc++) h += '<td data-r="' + ri + '" data-c="' + cc + '">' + esc(row[cc] || '') + '</td>'
        h += '</tr>'
      })
      h += '</tbody></table>'
      if (s.cut) h += '<div class="cut">Only the first ' + MAX_ROWS.toLocaleString() + ' rows and ' + MAX_COLS + ' columns are shown.</div>'
      h += more
      wrap.innerHTML = h
      st.table = wrap.querySelector('table')
      st.table.style.zoom = String(st.zoom)
      st.root = wrap
      bindGrid(st.table, s.rows.length, cols)
    }
    Array.prototype.forEach.call(app.querySelectorAll('.tabs button'), function (b, k) { b.classList.toggle('on', k === i) })
    reFind()
  }
  function bindGrid(table, nrows, ncols) {
    table.addEventListener('mousedown', function (e) {
      var t = e.target
      if (!t || !t.closest) return
      var td = t.closest('td[data-c]')
      var col = t.closest('th[data-col]')
      var row = t.closest('td.rh')
      bubble.hidden = true
      if (td) {
        var cr = Number(td.dataset.r)
        var cc = Number(td.dataset.c)
        if (e.shiftKey && st.anchor) {
          // Shift-click: everything between the cell clicked before and this one.
          st.rect = { r1: st.anchor.r, c1: st.anchor.c, r2: cr, c2: cc }
          st.drag = null
        } else {
          st.anchor = { r: cr, c: cc }
          st.drag = { r: cr, c: cc }
          st.rect = { r1: cr, c1: cc, r2: cr, c2: cc }
        }
      } else if (col) {
        var c = Number(col.dataset.col)
        var before = st.anchor
        st.anchor = { r: 0, c: c }
        st.rect = e.shiftKey && before ? { r1: 0, c1: before.c, r2: nrows - 1, c2: c } : { r1: 0, c1: c, r2: nrows - 1, c2: c }
        st.drag = null
      } else if (row) {
        var r = Number(row.dataset.row)
        st.anchor = { r: r, c: 0 }
        st.rect = { r1: r, c1: 0, r2: r, c2: ncols - 1 }
        st.drag = null
      } else return
      paint()
      if (!st.drag) cellBubble()
    })
    table.addEventListener('mouseover', function (e) {
      if (!st.drag) return
      var td = e.target && e.target.closest ? e.target.closest('td[data-c]') : null
      if (!td) return
      st.rect = { r1: st.drag.r, c1: st.drag.c, r2: Number(td.dataset.r), c2: Number(td.dataset.c) }
      paint()
    })
  }
  document.addEventListener('mouseup', function () {
    if (st.drag && st.rect) {
      st.drag = null
      cellBubble()
    }
  })
  function showSheets(wb, csv) {
    var sheets = []
    var names = wb.SheetNames.slice(0, MAX_SHEETS)
    st.leftOut = wb.SheetNames.length - names.length
    names.forEach(function (name) {
      var ws = wb.Sheets[name]
      // The used range a file claims can be far larger than its data, and the conversion fills all of it: cut the range before any cell is built.
      var cut = false
      if (ws['!ref']) {
        var rg = XLSX.utils.decode_range(ws['!ref'])
        cut = rg.e.r - rg.s.r >= MAX_ROWS || rg.e.c - rg.s.c >= MAX_COLS
        rg.e.r = Math.min(rg.e.r, rg.s.r + MAX_ROWS - 1)
        rg.e.c = Math.min(rg.e.c, rg.s.c + MAX_COLS - 1)
        ws['!ref'] = XLSX.utils.encode_range(rg)
      }
      // The rows are made when the sheet is first shown, so a file of many full sheets costs only the ones looked at.
      sheets.push({ name: name, cut: cut, ws: ws, rows: null })
    })
    if (!sheets.length) return note('This file has no sheets.', true)
    st.sheets = sheets
    var tabs = csv || sheets.length < 2 ? '' : '<div class="tabs">' + sheets.map(function (s, k) { return '<button data-k="' + k + '">' + esc(s.name) + '</button>' }).join('') + '</div>'
    app.innerHTML = '<div class="grid-wrap"></div>' + tabs
    var t = app.querySelector('.tabs')
    if (t) t.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) drawSheet(Number(b.dataset.k)) })
    drawSheet(0)
  }

  /* ---- a page or a slide wider than the panel is shrunk to fit it ---- */
  function fit() {
    var doc = app.querySelector('.docx-wrapper')
    if (doc) {
      doc.style.zoom = '1'
      var sec = doc.querySelector('section.docx')
      var room = app.querySelector('.doc-wrap').clientWidth - 28
      var f = sec && sec.offsetWidth > room ? Math.max(0.3, room / sec.offsetWidth) : 1
      doc.style.zoom = String(f * st.zoom)
    }
    var deck = document.getElementById('deck')
    var box = app.querySelector('.slides')
    if (deck && box) deck.style.zoom = String(Math.min(1, Math.max(0.3, (box.clientWidth - 28) / 760)) * st.zoom)
    if (st.table) st.table.style.zoom = String(st.zoom)
  }
  window.addEventListener('resize', fit)

  /* ---- loading ---- */
  function readable(e) {
    return 'This file could not be read. It may be damaged, password-protected or not what its name says.'
  }
  var run = 0
  async function load(m) {
    // A file opened while an earlier one is still being drawn takes over: the earlier one stops where it is.
    var mine = ++run
    st.kind = m.kind
    st.name = m.name
    st.csv = /\.(csv|tsv)$/i.test(m.name)
    st.sheets = []
    st.table = null
    st.root = null
    clearSelection()
    note('Opening the file…')
    try {
      if (m.kind === 'word') {
        await lib('jszip.js')
        await lib('docx.js')
        if (mine !== run) return
        app.innerHTML = '<div class="scroll doc-wrap"><div id="doc"></div></div>'
        await docx.renderAsync(m.bytes, document.getElementById('doc'), null, { inWrapper: true, breakPages: true, useBase64URL: true, experimental: false })
        if (mine !== run) return
        st.root = app.querySelector('.scroll')
        fit()
      } else if (m.kind === 'sheet') {
        await lib('xlsx.js')
        if (mine !== run) return
        var wb = st.csv
          ? XLSX.read(new TextDecoder().decode(new Uint8Array(m.bytes)), { type: 'string', sheetRows: MAX_ROWS + 1 })
          : XLSX.read(new Uint8Array(m.bytes), { type: 'array', sheetRows: MAX_ROWS + 1, cellFormula: false, cellHTML: false, cellStyles: false })
        showSheets(wb, st.csv)
      } else if (m.kind === 'slides') {
        await lib('pptx.js')
        if (mine !== run) return
        app.innerHTML = '<div class="deck"><div class="strip"></div><div class="slides scroll"><div id="deck"></div></div></div>'
        var host = document.getElementById('deck')
        var p = pptxPreview.init(host, { width: 760, height: 428, mode: 'list' })
        await p.preview(m.bytes)
        if (mine !== run) return
        slideStrip(host)
        st.root = app.querySelector('.slides')
        fit()
      }
    } catch (e) {
      if (mine !== run) return
      note(readable(e), true)
      post({ t: 'error', message: 'The file could not be read.' })
    }
  }
  function slideStrip(host) {
    var wrap = host.firstElementChild
    // The library gives its list a fixed height and a scrollbar of its own; the panel's own scroll serves instead.
    if (wrap) {
      wrap.style.height = 'auto'
      wrap.style.overflow = 'visible'
      wrap.style.background = 'transparent'
    }
    var list = wrap ? wrap.children : []
    var strip = app.querySelector('.strip')
    var n = 0
    var THUMB = 88
    Array.prototype.forEach.call(list, function (el) {
      n++
      el.setAttribute('data-slide', String(n))
      el.classList.add('slide-box')
      var b = document.createElement('button')
      b.setAttribute('data-n', String(n))
      b.setAttribute('aria-label', 'Slide ' + n)
      // A small copy of the slide, with its number; the copy is only to look at, so it carries no slide mark and takes no clicks.
      var scale = THUMB / el.offsetWidth
      var box = document.createElement('div')
      box.className = 'thumb'
      box.style.width = THUMB + 'px'
      box.style.height = Math.round(el.offsetHeight * scale) + 'px'
      var copy = el.cloneNode(true)
      copy.removeAttribute('data-slide')
      copy.classList.remove('slide-box')
      copy.style.margin = '0'
      copy.style.transform = 'scale(' + scale + ')'
      copy.style.transformOrigin = 'top left'
      box.appendChild(copy)
      var num = document.createElement('span')
      num.textContent = String(n)
      b.appendChild(box)
      b.appendChild(num)
      strip.appendChild(b)
    })
    var scroller = app.querySelector('.slides')
    var mark = function () {
      var top = scroller.getBoundingClientRect().top + 40
      var on = 1
      Array.prototype.forEach.call(host.querySelectorAll('[data-slide]'), function (el) {
        if (el.getBoundingClientRect().top <= top) on = Number(el.getAttribute('data-slide'))
      })
      Array.prototype.forEach.call(strip.children, function (x) { x.classList.toggle('on', x.getAttribute('data-n') === String(on)) })
    }
    scroller.addEventListener('scroll', mark)
    mark()
    strip.addEventListener('click', function (e) {
      var b = e.target.closest('button')
      var el = b && host.querySelector('[data-slide="' + b.dataset.n + '"]')
      if (el) el.scrollIntoView({ block: 'start' })
    })
    if (!n) note('This presentation has no slides.', true)
  }

  /* ---- search ---- */
  function clearHits() {
    Array.prototype.forEach.call(document.querySelectorAll('mark.hit'), function (mk) {
      var p = mk.parentNode
      p.replaceChild(document.createTextNode(mk.textContent), mk)
      p.normalize()
    })
    st.hits = []
    st.hit = 0
  }
  function markAll(q) {
    clearHits()
    var root = st.root
    if (!q || !root) return
    var re = q.toLowerCase()
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode
        if (!n.nodeValue.trim() || (p.closest && p.closest('th,td.rh,script,style,.cut'))) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    })
    var nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    nodes.forEach(function (n) {
      if (st.hits.length >= 1000) return
      var text = n.nodeValue
      var low = text.toLowerCase()
      var at = low.indexOf(re)
      if (at < 0) return
      var frag = document.createDocumentFragment()
      var last = 0
      while (at >= 0 && st.hits.length < 1000) {
        frag.appendChild(document.createTextNode(text.slice(last, at)))
        var mk = document.createElement('mark')
        mk.className = 'hit'
        mk.textContent = text.slice(at, at + re.length)
        frag.appendChild(mk)
        st.hits.push(mk)
        last = at + re.length
        at = low.indexOf(re, last)
      }
      frag.appendChild(document.createTextNode(text.slice(last)))
      n.parentNode.replaceChild(frag, n)
    })
  }
  function focusHit() {
    st.hits.forEach(function (h, i) { h.classList.toggle('on', i === st.hit) })
    var h = st.hits[st.hit]
    if (h) h.scrollIntoView({ block: 'center', inline: 'nearest' })
    post({ t: 'found', count: st.hits.length, index: st.hits.length ? st.hit + 1 : 0 })
  }
  function reFind() {
    if (st.q) {
      markAll(st.q)
      focusHit()
    }
  }
  function find(q, dir) {
    if (q !== st.q) {
      st.q = q
      markAll(q)
      st.hit = 0
    } else if (st.hits.length && dir) st.hit = (st.hit + dir + st.hits.length) % st.hits.length
    focusHit()
  }

  window.addEventListener('message', function (e) {
    if (e.source !== parent) return
    var m = e.data
    if (!m || typeof m !== 'object') return
    if (m.t === 'load' && m.bytes instanceof ArrayBuffer && typeof m.name === 'string') {
      document.body.className = m.theme === 'dark' ? 'dark' : 'paper'
      st.zoom = typeof m.zoom === 'number' && m.zoom >= 0.25 && m.zoom <= 4 ? m.zoom : 1
      load(m)
    } else if (m.t === 'theme') document.body.className = m.theme === 'dark' ? 'dark' : 'paper'
    else if (m.t === 'find' && typeof m.q === 'string') find(m.q, m.dir === -1 ? -1 : m.dir === 1 ? 1 : 0)
    else if (m.t === 'add') send()
    else if (m.t === 'zoom' && typeof m.z === 'number' && m.z >= 0.25 && m.z <= 4) {
      st.zoom = m.z
      bubble.hidden = true
      fit()
    }
  })
  post({ t: 'ready' })
})()
