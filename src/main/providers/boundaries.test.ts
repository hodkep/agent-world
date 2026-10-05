import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '..', '..')
const PROVIDERS = join(SRC, 'main', 'providers')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : /\.tsx?$/.test(f) ? [join(dir, f)] : []))
const importsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*'(\.[^']*)'/g)].map((m) => resolve(dirname(file), m[1]!))
const providerOf = (path: string) => (path.startsWith(PROVIDERS + sep) ? path.slice(PROVIDERS.length + 1).split(sep)[0]! : null)
const rel = (p: string) => relative(SRC, p)

describe('provider boundaries', () => {
  const files = walk(SRC).filter((f) => !f.includes('node_modules'))
  const edges = files.flatMap((f) => importsOf(f).map((to) => ({ from: f, to })))

  it('the rest of the app reaches providers only through the registry and ports', () => {
    const bad = edges.filter((e) => providerOf(e.from) === null && providerOf(e.to) !== null && !/^(registry|ports|shared)(\.test)?$/.test(providerOf(e.to)!.replace(/\.tsx?$/, '')) && !e.from.endsWith('.test.ts'))
    expect(bad.map((e) => `${rel(e.from)} -> ${rel(e.to)}`)).toEqual([])
  })

  it('providers never import each other', () => {
    const bad = edges.filter((e) => {
      const a = providerOf(e.from)
      const b = providerOf(e.to)
      return a && b && a !== b && ![a, b].some((x) => /^(registry|ports|shared)(\.tsx?)?$/.test(x))
    })
    expect(bad.map((e) => `${rel(e.from)} -> ${rel(e.to)}`)).toEqual([])
  })
})
