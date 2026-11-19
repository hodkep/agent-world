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

  var st = { kind: '', name: '', csv: false, sheets: [], sheet: 0, leftOut: 0, table: null, rect: null, drag: null, words: '', where: '', root: null, hits: [], hit: 0, q: '', selecting: false, zoom: 'width', anchor: null, dim: { rows: 0, cols: 0 }, map: [], pages: [], slide: 1, presenting: false }

  var chip = document.createElement('div')
  chip.className = 'chip pos'
  chip.hidden = true
  var sum = document.createElement('div')
  sum.className = 'chip sum'
  sum.hidden = true
  document.body.appendChild(chip)
  document.body.appendChild(sum)
  var chipTimer = 0
  function setChip(text) {
    chip.hidden = !text
    chip.textContent = text || ''
  }
  function setSum(text) {
    sum.hidden = !text
    sum.textContent = text || ''
    // With both chips showing, the position moves to the left so they never meet.
    document.body.classList.toggle('has-sum', !!text)
  }

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
    if (st.presenting) return presentKey(e)
    if (st.kind === 'slides' && !e.metaKey && !e.ctrlKey && !e.altKey && slideKey(e)) return e.preventDefault()
    if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') return
    // Copy is the page's own: the key stays here.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') return
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
    return st.map[r * st.dim.cols + c] || null
  }
  function clearCells() {
    if (st.table) Array.prototype.forEach.call(st.table.querySelectorAll('td.sel'), function (td) { td.classList.remove('sel') })
    st.rect = null
    setSum('')
  }
  // A cell's text as a number, or null: "1,200", "$1,234.50", "12%", "(5)" count; anything else does not.
  function num(v) {
    var t = String(v).trim()
    if (!/^[-+(]?[$€£]?\s?[\d.,]+\s?%?\)?$/.test(t)) return null
    var x = parseFloat(t.replace(/[^\d.]/g, ''))
    if (!isFinite(x)) return null
    return /^[(-]/.test(t) ? -x : x
  }
  function fmt(x) {
    return x.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  // What is selected, in a chip: how many cells, and for the numbers among them their sum and average.
  function updateSum() {
    var s = st.sheets[st.sheet]
    if (!st.rect || !s || !s.rows) return setSum('')
    var r = norm(st.rect)
    var cells = (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1)
    var n = 0
    var total = 0
    if (cells <= 200000) {
      for (var i = r.r1; i <= r.r2; i++) for (var j = r.c1; j <= r.c2; j++) {
        var v = s.rows[i] && s.rows[i][j]
        var x = v ? num(v) : null
        if (x !== null) {
          n++
          total += x
        }
      }
    }
    setSum(cells + (cells === 1 ? ' cell' : ' cells') + (n ? ' · Σ ' + fmt(total) + ' · avg ' + fmt(total / n) : ''))
  }
  // Copying cells gives tab-separated text, as a spreadsheet does; copying words is the page's own.
  document.addEventListener('copy', function (e) {
    if (st.kind !== 'sheet' || !st.rect || !st.sheets[st.sheet] || !st.sheets[st.sheet].rows) return
    var r = norm(st.rect)
    var rows = st.sheets[st.sheet].rows
    var out = []
    for (var i = r.r1; i <= Math.min(r.r2, r.r1 + 4999); i++) {
      var line = []
      for (var j = r.c1; j <= r.c2; j++) line.push(String((rows[i] && rows[i][j]) || '').replace(/[\t\r\n]+/g, ' '))
      out.push(line.join('\t'))
    }
    e.clipboardData.setData('text/plain', out.join('\n'))
    e.preventDefault()
  })
  function paint() {
    if (!st.table || !st.rect) return
    Array.prototype.forEach.call(st.table.querySelectorAll('td.sel'), function (td) { td.classList.remove('sel') })
    var r = norm(st.rect)
    for (var i = r.r1; i <= r.r2; i++) for (var j = r.c1; j <= r.c2; j++) {
      var td = cellAt(i, j)
      if (td) td.classList.add('sel')
    }
    updateSum()
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
    if (!s.rows) s.rows = XLSX.utils.sheet_to_json(s.ws, { header: 1, raw: false, defval: '', blankrows: true }).map(function (r) { return r.map(String) })
    var cols = 0
    s.rows.forEach(function (r) { cols = Math.max(cols, r.length) })
    st.dim = { rows: s.rows.length, cols: cols }
    st.map = []
    var wrap = app.querySelector('.grid-wrap')
    var blank = !s.rows.some(function (r) { return r.some(function (c) { return c !== '' }) })
    var more = st.leftOut > 0 ? '<div class="cut">Only the first ' + MAX_SHEETS + ' sheets are shown; ' + st.leftOut + ' more are left out.</div>' : ''
    if (blank || !cols) {
      wrap.innerHTML = '<div class="note">This sheet is empty.</div>' + more
      st.table = null
      st.root = wrap
    } else {
      var ws = s.ws
      var cw = (ws && ws['!cols']) || []
      var rh = (ws && ws['!rows']) || []
      // Merged cells: the first cell of each range holds it, the others are left out.
      var span = {}
      var covered = {}
      ;((ws && ws['!merges']) || []).forEach(function (m) {
        if (m.s.r >= s.rows.length || m.s.c >= cols) return
        var r2 = Math.min(m.e.r, s.rows.length - 1)
        var c2 = Math.min(m.e.c, cols - 1)
        span[m.s.r + ',' + m.s.c] = { rs: r2 - m.s.r + 1, cs: c2 - m.s.c + 1 }
        for (var a = m.s.r; a <= r2; a++) for (var b = m.s.c; b <= c2; b++) if (a !== m.s.r || b !== m.s.c) covered[a + ',' + b] = true
      })
      var sized = cw.some(function (c) { return c && c.wpx })
      var h = '<table class="g"' + (sized ? ' style="table-layout:fixed"' : '') + '><colgroup>'
      if (sized) {
        h += '<col style="width:44px">'
        for (var k = 0; k < cols; k++) if (!(cw[k] && cw[k].hidden)) h += '<col style="width:' + Math.max(8, Math.min(2000, Number(cw[k] && cw[k].wpx) || 64)) + 'px">'
      }
      h += '</colgroup><thead><tr><th></th>'
      for (var c = 0; c < cols; c++) if (!(cw[c] && cw[c].hidden)) h += '<th data-col="' + c + '">' + letters(c) + '</th>'
      h += '</tr></thead><tbody>'
      s.rows.forEach(function (row, ri) {
        if (rh[ri] && rh[ri].hidden) return
        h += '<tr' + (rh[ri] && Number(rh[ri].hpx) > 0 ? ' style="height:' + Math.min(2000, Math.round(Number(rh[ri].hpx))) + 'px"' : '') + '><td class="rh" data-row="' + ri + '">' + (ri + 1) + '</td>'
        for (var cc = 0; cc < cols; cc++) {
          if ((cw[cc] && cw[cc].hidden) || covered[ri + ',' + cc]) continue
          var sp = span[ri + ',' + cc]
          var cell = ws && ws[XLSX.utils.encode_cell({ r: ri, c: cc })]
          var fill = cell && cell.s && cell.s.patternType === 'solid' && cell.s.fgColor && cell.s.fgColor.rgb ? String(cell.s.fgColor.rgb).slice(-6) : ''
          var ok = /^[0-9A-Fa-f]{6}$/.test(fill)
          h += '<td data-r="' + ri + '" data-c="' + cc + '"' + (sp ? ' rowspan="' + sp.rs + '" colspan="' + sp.cs + '"' : '') + (ok ? ' class="fill" style="background:#' + fill + '"' : '') + '>' + esc(row[cc] || '') + '</td>'
        }
        h += '</tr>'
      })
      h += '</tbody></table>'
      if (s.cut) h += '<div class="cut">Only the first ' + MAX_ROWS.toLocaleString() + ' rows and ' + MAX_COLS + ' columns are shown.</div>'
      h += more
      wrap.innerHTML = h
      st.table = wrap.querySelector('table')
      st.table.style.zoom = String(typeof st.zoom === 'number' ? st.zoom : 1)
      st.table.style.setProperty('--thh', st.table.tHead.rows[0].offsetHeight + 'px')
      st.root = wrap
      // Each cell, by its place; a merged range answers with the cell that holds it.
      Array.prototype.forEach.call(st.table.querySelectorAll('td[data-r]'), function (td) {
        var r0 = Number(td.dataset.r)
        var c0 = Number(td.dataset.c)
        var m = span[r0 + ',' + c0] || { rs: 1, cs: 1 }
        for (var a = r0; a < r0 + m.rs; a++) for (var b = c0; b < c0 + m.cs; b++) st.map[a * cols + b] = td
      })
      bindGrid(st.table, s.rows.length, cols)
    }
    Array.prototype.forEach.call(app.querySelectorAll('.tabs button'), function (b, k) { b.classList.toggle('on', k === i) })
    showPos()
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
    var hidden = (wb.Workbook && wb.Workbook.Sheets) || []
    var shown = wb.SheetNames.filter(function (n, k) { return !(hidden[k] && hidden[k].Hidden) })
    var all = shown.length ? shown : wb.SheetNames
    var names = all.slice(0, MAX_SHEETS)
    st.leftOut = all.length - names.length
    names.forEach(function (name) {
      var ws = wb.Sheets[name]
      // The used range a file claims can be far larger than its data, and the conversion fills all of it: cut the range before any cell is built.
      // It also starts at A1, so a row's place in the grid is its row number in the sheet.
      var cut = false
      if (ws['!ref']) {
        var rg = XLSX.utils.decode_range(ws['!ref'])
        rg.s.r = 0
        rg.s.c = 0
        cut = rg.e.r >= MAX_ROWS || rg.e.c >= MAX_COLS
        rg.e.r = Math.min(rg.e.r, MAX_ROWS - 1)
        rg.e.c = Math.min(rg.e.c, MAX_COLS - 1)
        ws['!ref'] = XLSX.utils.encode_range(rg)
      }
      // The rows are made when the sheet is first shown, so a file of many full sheets costs only the ones looked at.
      sheets.push({ name: name, cut: cut, ws: ws, rows: null })
    })
    if (!sheets.length) return note('This file has no sheets.', true)
    st.sheets = sheets
    var tabs = csv || sheets.length < 2 ? '' : '<div class="tabs">' + sheets.map(function (s, k) { return '<button data-k="' + k + '">' + esc(s.name) + '</button>' }).join('') + '</div>'
    app.innerHTML = '<div class="grid-wrap"></div>' + tabs
    app.querySelector('.grid-wrap').addEventListener('scroll', showPos)
    var t = app.querySelector('.tabs')
    if (t) t.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) drawSheet(Number(b.dataset.k)) })
    drawSheet(0)
  }

  /* ---- zoom: a mark, or a fit to the panel's width or to a whole page or slide ---- */
  function okZoom(z) {
    return z === 'width' || z === 'page' || (typeof z === 'number' && z >= 0.25 && z <= 4)
  }
  function px(v) {
    var n = parseFloat(v)
    if (!isFinite(n)) return 0
    return /pt$/.test(v) ? (n * 96) / 72 : n
  }
  function scaleFor(w, h, boxW, boxH) {
    if (typeof st.zoom === 'number') return st.zoom
    var byWidth = (boxW - 28) / w
    return Math.max(0.3, Math.min(1.5, st.zoom === 'page' ? Math.min(byWidth, (boxH - 28) / h) : byWidth))
  }
  function fit() {
    var doc = app.querySelector('.docx-wrapper')
    if (doc) {
      doc.style.zoom = '1'
      var sec = doc.querySelector('section.docx')
      var box = app.querySelector('.doc-wrap')
      if (sec && box) doc.style.zoom = String(scaleFor(sec.offsetWidth, px(sec.style.minHeight) || sec.offsetHeight, box.clientWidth, box.clientHeight))
    }
    var deck = document.getElementById('deck')
    var slides = app.querySelector('.slides')
    if (deck && slides) {
      deck.style.zoom = '1'
      var first = deck.querySelector('[data-slide]')
      var sw = first ? px(first.style.width) || first.offsetWidth : 760
      var sh = first ? px(first.style.height) || first.offsetHeight : 570
      deck.style.zoom = String(scaleFor(sw, sh, slides.clientWidth, slides.clientHeight))
    }
    if (st.table) st.table.style.zoom = String(typeof st.zoom === 'number' ? st.zoom : 1)
  }
  window.addEventListener('resize', function () {
    fit()
    showPos()
    if (st.presenting) drawPresent()
  })

  /* ---- where you are: a chip at the bottom, shown for a second after anything moves ---- */
  function showPos() {
    updatePos()
    chip.classList.remove('gone')
    clearTimeout(chipTimer)
    chipTimer = setTimeout(function () {
      chip.classList.add('gone')
    }, 1000)
  }
  function wordPos() {
    if (!st.pages.length || !st.root) return ''
    var cy = st.root.getBoundingClientRect().top + st.root.clientHeight / 2
    var page = 1
    st.pages.forEach(function (p) {
      var r = p.el.getBoundingClientRect()
      if (cy >= r.top) page = p.start + Math.max(0, Math.min(p.n - 1, Math.floor((cy - r.top) / (r.height / p.n))))
    })
    return 'Page ' + page + ' / ' + st.totalPages
  }
  function updatePos() {
    if (st.presenting) return setChip('')
    if (st.kind === 'word') setChip(wordPos())
    else if (st.kind === 'sheet') {
      var s = st.sheets[st.sheet]
      if (!s || !s.rows) return setChip('')
      setChip((st.csv ? '' : 'Sheet ' + (st.sheet + 1) + ' / ' + st.sheets.length + ' · ') + s.rows.length + (s.cut ? '+' : '') + ' × ' + st.dim.cols)
    } else if (st.kind === 'slides') setChip(st.slideCount ? 'Slide ' + st.slide + ' / ' + st.slideCount : '')
    else setChip('')
  }

  /* ---- Word: the pages ---- */
  // A run of text longer than a page is split into separate pages the way Word does it, block by block: a new page starts before the first
  // paragraph, heading or table row that does not fit, so no line is cut. Each new page is a copy of the page's shell with the file's header and footer.
  function isHeading(el) {
    return /^H[1-6]$/.test(el.tagName) || /docx_(heading|title)/i.test(el.className)
  }
  function splitSection(sec) {
    var art = sec.querySelector(':scope > article')
    if (!art) return
    // A file with hundreds of thousands of blocks is left as one long page: measuring them all would stall the viewer.
    if (art.children.length > 100000) return
    var cs = getComputedStyle(sec)
    var hdr = sec.querySelector(':scope > header')
    var ftr = sec.querySelector(':scope > footer')
    var flow = function (el) {
      return el ? el.getBoundingClientRect().height + (parseFloat(getComputedStyle(el).marginBottom) || 0) + (parseFloat(getComputedStyle(el).marginTop) || 0) : 0
    }
    // What one page's text may fill: the page's height less its margins, header and footer.
    var avail = (px(sec.style.minHeight) || 1056) - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - flow(hdr) - flow(ftr)
    var top0 = art.getBoundingClientRect().top
    if (art.getBoundingClientRect().height <= avail * 1.02 || avail < 100) return
    // Measure everything first, then move: moving a block changes where the next one sits.
    var blocks = Array.prototype.map.call(art.children, function (el) {
      var r = el.getBoundingClientRect()
      // The space around a block counts too: a page is as tall as its first block's top margin, the blocks, and its last block's bottom margin.
      var m = getComputedStyle(el)
      var b = { el: el, top: r.top - top0 - (parseFloat(m.marginTop) || 0), bottom: r.bottom - top0 + (parseFloat(m.marginBottom) || 0), rows: null }
      if (el.tagName === 'TABLE' && el.rows.length > 1)
        b.rows = Array.prototype.map.call(el.rows, function (tr) {
          var rr = tr.getBoundingClientRect()
          return { el: tr, top: rr.top - top0, bottom: rr.bottom - top0 }
        })
      return b
    })
    var pages = [[]]
    var pageTop = blocks.length ? blocks[0].top : 0
    var cur = function () { return pages[pages.length - 1] }
    var next = function (top) {
      pages.push([])
      pageTop = top
    }
    blocks.forEach(function (b) {
      var fits = b.bottom - pageTop <= avail
      if (fits || (!cur().length && !b.rows)) return void cur().push({ el: b.el, top: b.top })
      if (!b.rows) {
        // It starts the next page; a heading before it goes along, so it is never left alone at the foot of a page.
        var last = cur()[cur().length - 1]
        var carry = last && cur().length > 1 && last.el && isHeading(last.el) ? cur().pop() : null
        next(carry ? carry.top : b.top)
        if (carry) cur().push(carry)
        return void cur().push({ el: b.el, top: b.top })
      }
      // A table that does not fit is split between its rows.
      var i = 0
      while (i < b.rows.length) {
        if (!cur().length) pageTop = b.rows[i].top
        var j = i
        while (j < b.rows.length && b.rows[j].bottom - pageTop <= avail) j++
        if (j === i) {
          if (cur().length) {
            next(b.rows[i].top)
            continue
          }
          j = i + 1
        }
        cur().push({ table: b.el, from: i, to: j, top: b.rows[i].top })
        i = j
        if (i < b.rows.length) next(b.rows[i].top)
      }
    })
    if (pages.length < 2) return
    var tableRows = new Map()
    blocks.forEach(function (b) {
      if (b.rows) tableRows.set(b.el, b.rows.map(function (r) { return r.el }))
    })
    var prev = sec
    pages.forEach(function (items, k) {
      var targetSec = sec
      var targetArt = art
      if (k > 0) {
        targetSec = sec.cloneNode(false)
        if (hdr) targetSec.appendChild(hdr.cloneNode(true))
        targetArt = art.cloneNode(false)
        targetSec.appendChild(targetArt)
        if (ftr) targetSec.appendChild(ftr.cloneNode(true))
        prev.after(targetSec)
        prev = targetSec
      }
      items.forEach(function (it) {
        if (it.el) {
          if (it.el.parentNode !== targetArt) targetArt.appendChild(it.el)
        } else if (it.from === 0) {
          // The first piece of a table (or all of it) is the table itself; the rows of its later pieces are taken out of it below.
          if (it.table.parentNode !== targetArt) targetArt.appendChild(it.table)
        } else {
          var rows = tableRows.get(it.table).slice(it.from, it.to)
          var shell = it.table.cloneNode(false)
          Array.prototype.forEach.call(it.table.children, function (c) {
            if (c.tagName === 'COLGROUP') shell.appendChild(c.cloneNode(true))
          })
          var body = document.createElement('tbody')
          shell.appendChild(body)
          rows.forEach(function (tr) { body.appendChild(tr) })
          targetArt.appendChild(shell)
        }
      })
      prev = targetSec
    })
  }
  async function paginate(bytes, mine) {
    var doc = app.querySelector('.docx-wrapper')
    if (!doc) return
    doc.style.zoom = '1'
    Array.prototype.slice.call(doc.querySelectorAll('section.docx')).forEach(splitSection)
    var pages = []
    Array.prototype.forEach.call(doc.querySelectorAll('section.docx'), function (sec, k) {
      pages.push({ el: sec, start: k + 1, n: 1 })
    })
    var total = pages.length
    st.pages = pages
    st.totalPages = total
    // The footers carry the page the file last saved in its page-number fields; the real number goes in (by what the file's own headers and footers hold).
    try {
      var zip = await JSZip.loadAsync(bytes)
      var names = Object.keys(zip.files).filter(function (n) { return /^word\/(header|footer)\d*\.xml$/.test(n) })
      var xml = (await Promise.all(names.map(function (n) { return zip.files[n].async('string') }))).join('')
      if (mine !== run) return
      var hasPage = /(instrText[^>]*>|w:instr=")\s*PAGE\b/.test(xml)
      var hasTotal = /NUMPAGES/.test(xml)
      pages.forEach(function (p) {
        Array.prototype.forEach.call(p.el.querySelectorAll('header span, footer span'), function (sp) {
          if (sp.children.length) return
          var t = sp.textContent
          var next = sp.nextElementSibling
          var nextIsNumber = !!next && !next.children.length && /^\d{1,5}$/.test(next.textContent.trim())
          if (/^\d{1,5}$/.test(t.trim())) {
            // The number a field saved: the real one goes in.
            var prev = sp.previousElementSibling
            if (/(?:\bof|\/)\s*$/i.test(prev ? prev.textContent : '')) {
              if (hasTotal) sp.textContent = String(total)
            } else if (hasPage) sp.textContent = String(p.start)
          } else if (!nextIsNumber) {
            // A field that saved nothing leaves "Page  of ": the numbers go after the words.
            if (hasPage && /\bPage\s*$/i.test(t)) sp.textContent = t + String(p.start)
            else if (hasTotal && /\bof\s*$/i.test(t)) sp.textContent = t + String(total)
          }
        })
      })
    } catch (e) {
      // The numbers stay as the file saved them.
    }
  }

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
    st.pages = []
    st.slideCount = 0
    st.slide = 1
    if (st.presenting) present(false, true)
    setChip('')
    setSum('')
    clearSelection()
    note('Opening the file…')
    try {
      if (m.kind === 'word') {
        await lib('jszip.js')
        await lib('docx.js')
        if (mine !== run) return
        app.innerHTML = '<div class="scroll doc-wrap"><div id="doc"></div></div>'
        await docx.renderAsync(m.bytes, document.getElementById('doc'), null, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, useBase64URL: true, experimental: false })
        if (mine !== run) return
        st.root = app.querySelector('.scroll')
        st.pages = []
        await paginate(m.bytes, mine)
        if (mine !== run) return
        st.root.addEventListener('scroll', showPos)
        fit()
        showPos()
      } else if (m.kind === 'sheet') {
        await lib('xlsx.js')
        if (mine !== run) return
        var wb = st.csv
          ? XLSX.read(new TextDecoder().decode(new Uint8Array(m.bytes)), { type: 'string', sheetRows: MAX_ROWS + 1 })
          : XLSX.read(new Uint8Array(m.bytes), { type: 'array', sheetRows: MAX_ROWS + 1, cellFormula: false, cellHTML: false, cellStyles: true })
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
        showPos()
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
    st.slideCount = n
    var scroller = app.querySelector('.slides')
    var mark = function () {
      var top = scroller.getBoundingClientRect().top + 40
      var on = 1
      Array.prototype.forEach.call(host.querySelectorAll('[data-slide]'), function (el) {
        if (el.getBoundingClientRect().top <= top) on = Number(el.getAttribute('data-slide'))
      })
      Array.prototype.forEach.call(strip.children, function (x) { x.classList.toggle('on', x.getAttribute('data-n') === String(on)) })
      st.slide = on
      showPos()
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

  /* ---- slides: the keys, and present mode ---- */
  function goSlide(n) {
    var els = document.querySelectorAll('#deck [data-slide]')
    if (!els.length) return
    st.slide = Math.max(1, Math.min(els.length, n))
    els[st.slide - 1].scrollIntoView({ block: 'start' })
    showPos()
  }
  // Left and right, Page Up and Page Down, Home and End move between slides; the other keys keep scrolling the list.
  function slideKey(e) {
    var k = e.key
    if (k === 'ArrowRight' || k === 'PageDown') goSlide(st.slide + 1)
    else if (k === 'ArrowLeft' || k === 'PageUp') goSlide(st.slide - 1)
    else if (k === 'Home') goSlide(1)
    else if (k === 'End') goSlide(st.slideCount)
    else return false
    return true
  }
  var stage = null
  function drawPresent() {
    var src = document.querySelector('#deck [data-slide="' + st.slide + '"]')
    if (!stage || !src) return
    var w = px(src.style.width) || 760
    var h = px(src.style.height) || 570
    var box = stage.querySelector('.stage')
    box.innerHTML = ''
    var copy = src.cloneNode(true)
    copy.removeAttribute('data-slide')
    copy.classList.remove('slide-box')
    copy.style.margin = '0'
    box.appendChild(copy)
    box.style.width = w + 'px'
    box.style.height = h + 'px'
    box.style.transform = 'translate(-50%,-50%) scale(' + Math.min(window.innerWidth / w, window.innerHeight / h) + ')'
  }
  function present(on, quiet) {
    if (on) {
      if (st.kind !== 'slides' || !st.slideCount || st.presenting) return
      st.presenting = true
      stage = document.createElement('div')
      stage.className = 'present'
      stage.innerHTML = '<div class="stage"></div><div class="present-hint">← → move · Esc leaves</div>'
      stage.addEventListener('click', function () {
        presentMove(1)
      })
      document.body.appendChild(stage)
      bubble.hidden = true
      setChip('')
      setSum('')
      drawPresent()
      post({ t: 'present', on: true })
    } else if (st.presenting) {
      st.presenting = false
      if (stage) stage.remove()
      stage = null
      if (!quiet) post({ t: 'present', on: false })
      goSlide(st.slide)
    }
  }
  function presentMove(d) {
    st.slide = Math.max(1, Math.min(st.slideCount, st.slide + d))
    drawPresent()
  }
  function presentKey(e) {
    var k = e.key
    if (k === 'Escape') present(false)
    else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') presentMove(1)
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') presentMove(-1)
    else if (k === 'Home') presentMove(-st.slideCount)
    else if (k === 'End') presentMove(st.slideCount)
    else return
    e.preventDefault()
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
      st.zoom = okZoom(m.zoom) ? m.zoom : 'width'
      load(m)
    } else if (m.t === 'theme') document.body.className = m.theme === 'dark' ? 'dark' : 'paper'
    else if (m.t === 'find' && typeof m.q === 'string') find(m.q, m.dir === -1 ? -1 : m.dir === 1 ? 1 : 0)
    else if (m.t === 'add') send()
    else if (m.t === 'zoom' && okZoom(m.z)) {
      st.zoom = m.z
      bubble.hidden = true
      fit()
      showPos()
    } else if (m.t === 'present') {
      if (m.on) present(true)
      else present(false, true)
    }
  })
  post({ t: 'ready' })
})()
