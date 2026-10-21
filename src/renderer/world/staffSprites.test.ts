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
