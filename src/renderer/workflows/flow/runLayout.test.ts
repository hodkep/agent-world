import { describe, expect, it } from 'vitest'
import type { Lane, StepState } from '../../../shared/steps'
import { LANE_X, PITCH, layoutRun } from './runLayout'

const st = (id: string, state: StepState['state'] = 'passed'): StepState => ({ id, kind: 'work', name: id, state })
const main = ['plan', 'designs', 'build', 'tests', 'review', 'commit']
const lane = (over: Partial<Lane> = {}): Lane => ({ item: 2, title: 'Also CSV', at: 1, fork: 'build', join: 'review', steps: ['plan', 'designs', 'build', 'tests'].map((id) => st(id, 'pending')), ...over })

describe('where the cards of a run are drawn, with the work added to it as branches', () => {
  it('a run with nothing added is one column, a card for each step', () => {
    const l = layoutRun(main.map((id) => st(id)), [])
    expect(l.nodes.map((n) => [n.id, n.x, n.y])).toEqual(main.map((id, i) => [id, 0, i * PITCH]))
    expect(l.edges).toEqual([])
    expect(l.rows).toBe(main.length)
  })

  it('added work is a column of its own, from the row after the step the run had reached', () => {
    const l = layoutRun(main.map((id) => st(id)), [lane()])
    const laneNodes = l.nodes.filter((n) => n.lane === 2)
    expect(laneNodes.map((n) => [n.id, n.x, n.y])).toEqual(['plan', 'designs', 'build', 'tests'].map((id, j) => [`lane2-${id}`, LANE_X, (3 + j) * PITCH]))
  })

  it('a lane longer than the gap pushes the shared steps down, so it joins from above', () => {
    const l = layoutRun(main.map((id) => st(id)), [lane()])
    const at = (id: string) => l.nodes.find((n) => n.id === id)!.y / PITCH
    expect([at('build'), at('tests')]).toEqual([2, 3])
    // The lane takes rows 3 to 6; review, which it joins, comes after it.
    expect(at('review')).toBe(7)
    expect(at('commit')).toBe(8)
    expect(l.rows).toBe(9)
  })

  it('joins the lane to the main chain: the fork step to its first card, card to card, its last card to the first shared step', () => {
    const l = layoutRun(main.map((id) => st(id)), [lane()])
    expect(l.edges.map((e) => `${e.source}>${e.target}`)).toEqual(['build>lane2-plan', 'lane2-plan>lane2-designs', 'lane2-designs>lane2-build', 'lane2-build>lane2-tests', 'lane2-tests>review'])
  })

  it('a second piece of work is a second column', () => {
    const l = layoutRun(main.map((id) => st(id)), [lane(), lane({ item: 3, title: 'And a PDF' })])
    expect(new Set(l.nodes.filter((n) => n.lane === 3).map((n) => n.x))).toEqual(new Set([LANE_X * 2]))
  })

  it('added before any step was reported, the lane starts at the first row and has no fork edge', () => {
    const l = layoutRun(main.map((id) => st(id)), [lane({ fork: undefined })])
    expect(l.nodes.find((n) => n.id === 'lane2-plan')!.y).toBe(0)
    expect(l.edges[0]!.source).toBe('lane2-plan')
  })

  it('counts the rows the lane needs when it runs past the main chain', () => {
    const l = layoutRun(['a', 'b'].map((id) => st(id)), [lane({ fork: 'b', join: undefined })])
    expect(l.rows).toBe(2 + 4)
  })
})
