import { describe, expect, it } from 'vitest'
import { STAFF_KEYS, type StaffKind, type StaffPose, staffPixels } from './staffSprites'

const KINDS: StaffKind[] = ['boy', 'supervisor']
const POSES: StaffPose[] = ['stand', 'walk1', 'walk2', 'salute', 'point', 'wipe', 'sip', 'call', 'chin', 'hold', 'reach', 'clasp']

describe('the office boy and the supervisor', () => {
  it('are 16x24 in every view and pose, drawn only in the colours they have', () => {
    for (const kind of KINDS)
      for (const view of ['front', 'side', 'back'] as const)
        for (const pose of POSES) {
          const rows = staffPixels(kind, view, pose)
          expect(rows, `${kind} ${view} ${pose}`).toHaveLength(24)
          for (const row of rows) {
            expect(row).toHaveLength(16)
            for (const ch of row) expect(ch === '.' || ch in STAFF_KEYS[kind], `${kind} ${view} ${pose} '${ch}'`).toBe(true)
          }
        }
  })

  it('differ from each other and between poses, so a salute and a walk can be told apart', () => {
    expect(staffPixels('boy', 'front', 'stand')).not.toEqual(staffPixels('supervisor', 'front', 'stand'))
    expect(staffPixels('boy', 'front', 'salute')).not.toEqual(staffPixels('boy', 'front', 'stand'))
    expect(staffPixels('boy', 'side', 'salute')).not.toEqual(staffPixels('boy', 'side', 'stand'))
    expect(staffPixels('supervisor', 'front', 'point')).not.toEqual(staffPixels('supervisor', 'front', 'stand'))
    expect(staffPixels('boy', 'front', 'walk1')).not.toEqual(staffPixels('boy', 'front', 'walk2'))
    expect(staffPixels('boy', 'side', 'wipe')).not.toEqual(staffPixels('boy', 'side', 'stand'))
    expect(staffPixels('boy', 'back', 'salute')).not.toEqual(staffPixels('boy', 'back', 'stand'))
    for (const kind of KINDS) for (const pose of ['sip', 'call', 'chin', 'hold'] as const) for (const view of ['front', 'side'] as const) expect(staffPixels(kind, view, pose), `${kind} ${view} ${pose}`).not.toEqual(staffPixels(kind, view, 'stand'))
    for (const kind of KINDS) for (const pose of ['reach', 'clasp'] as const) for (const view of ['front', 'back', 'side'] as const) if (!(pose === 'clasp' && view === 'side')) expect(staffPixels(kind, view, pose), `${kind} ${view} ${pose}`).not.toEqual(staffPixels(kind, view, 'stand'))
    expect(staffPixels('boy', 'back', 'salute')).not.toEqual(staffPixels('boy', 'front', 'salute'))
  })

  it('wears what they are known by: the office boy a red gamcha and khaki, the supervisor a bare crown and a belly wider than his shoulders', () => {
    const boy = staffPixels('boy', 'front', 'stand').join('')
    expect(boy).toContain('r')
    expect(boy).toContain('c')
    const sup = staffPixels('supervisor', 'front', 'stand')
    expect(sup.slice(2, 5).join('')).toContain('s')
    expect(sup[12]!.match(/c+/)![0].length).toBeLessThan(sup[16]!.match(/c+/)![0].length)
  })
})

describe('the git courier', () => {
  const chest = (kind: StaffKind, view: 'front' | 'side' | 'back', pose: StaffPose = 'stand') => staffPixels(kind, view, pose).slice(12, 17).join('')

  it('wears the git mark on his chest, seen from the front and the side, in every pose he is drawn in', () => {
    for (const view of ['front', 'side'] as const)
      for (const pose of ['stand', 'walk1', 'walk2'] as const) {
        const rows = staffPixels('git', view, pose).slice(12, 17).join('')
        expect([...rows].filter((c) => c === 'g').length, `${view} ${pose}`).toBeGreaterThanOrEqual(8)
      }
  })

  it('does not wear it from behind, and the clock courier has no mark at all', () => {
    expect(chest('git', 'back')).not.toContain('g')
    expect(chest('courier', 'front')).not.toContain('g')
    expect(chest('courier', 'side')).not.toContain('g')
  })

  it('stays inside the 16x24 figure and its own colours', () => {
    for (const view of ['front', 'side', 'back'] as const) {
      const rows = staffPixels('git', view, 'stand')
      expect(rows).toHaveLength(24)
      for (const row of rows) {
        expect(row).toHaveLength(16)
        for (const ch of row) expect(ch === '.' || ch in STAFF_KEYS.git!, `${view} '${ch}'`).toBe(true)
      }
    }
  })
})

describe('the librarian', () => {
  it('is drawn in her own colours, grey hair and a cardigan, and wears glasses seen from the front and the side', () => {
    expect(STAFF_KEYS.librarian!.h).not.toBe(STAFF_KEYS.boy!.h)
    expect(STAFF_KEYS.librarian!.c).not.toBe(STAFF_KEYS.boy!.c)
    for (const view of ['front', 'side'] as const) expect(staffPixels('librarian', view, 'stand')[7], view).toContain('w')
    expect(staffPixels('librarian', 'back', 'stand')[7]).not.toContain('w')
  })

  it('has every pose the beats use, 16x24, in her own colours', () => {
    for (const view of ['front', 'side', 'back'] as const)
      for (const pose of ['stand', 'walk1', 'walk2', 'hold', 'reach', 'wipe', 'point', 'chin'] as const) {
        const rows = staffPixels('librarian', view, pose)
        expect(rows).toHaveLength(24)
        for (const row of rows) for (const ch of row) expect(ch === '.' || ch in STAFF_KEYS.librarian!, `${view} ${pose} '${ch}'`).toBe(true)
      }
  })
})
