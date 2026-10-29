// Search over search.json (the title and the first part of every page). Words are all required; the title counts more than the text.
const input = document.querySelector('[data-search]')
const list = document.querySelector('[data-hits]')
if (input && list) {
  const root = document.body.dataset.root ?? ''
  let index = null
  const load = () => (index ??= fetch(root + 'search.json').then((r) => r.json()).catch(() => []))
  const show = async () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean)
    list.replaceChildren()
    list.hidden = words.length === 0
    if (!words.length) return
    const hits = (await load())
      .map((e) => ({ e, s: words.every((w) => (e.title + ' ' + e.text).toLowerCase().includes(w)) ? words.reduce((n, w) => n + (e.title.toLowerCase().includes(w) ? 5 : 1), 0) : 0 }))
      .filter((h) => h.s)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
    for (const { e } of hits) {
      const li = document.createElement('li')
      const a = Object.assign(document.createElement('a'), { href: root + e.url, textContent: e.title })
      const small = Object.assign(document.createElement('small'), { textContent: e.section })
      a.append(small)
      li.append(a)
      list.append(li)
    }
    if (!hits.length) list.append(Object.assign(document.createElement('li'), { textContent: 'Nothing found.' }))
  }
  input.addEventListener('input', show)
  input.addEventListener('focus', load)
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') (e.preventDefault(), input.focus())
  })
}
