import { describe, expect, it } from 'vitest'
import { budgetAlert, finishedTurn, shouldNotify } from './attention'

describe('budget alerts', () => {
  it('warns once when crossing 80% and once when crossing the cap', () => {
    expect(budgetAlert(0.5, 0.79, 1)).toBeNull()
    expect(budgetAlert(0.79, 0.81, 1)).toBe('near')
    expect(budgetAlert(0.81, 0.9, 1)).toBeNull()
    expect(budgetAlert(0.9, 1.01, 1)).toBe('over')
    expect(budgetAlert(1.01, 1.5, 1)).toBeNull()
  })

  it('jumping straight past the cap reports over, and no budget means no alerts', () => {
    expect(budgetAlert(0.1, 2, 1)).toBe('over')
    expect(budgetAlert(0, 50, undefined)).toBeNull()
  })
})

describe('turn finished', () => {
  it('is the moment a working agent goes idle or starts waiting', () => {
    expect(finishedTurn('implementing', 'idle')).toBe(true)
    expect(finishedTurn('thinking', 'waiting')).toBe(true)
    expect(finishedTurn('idle', 'waiting')).toBe(false)
    expect(finishedTurn(undefined, 'idle')).toBe(false)
    expect(finishedTurn('idle', 'thinking')).toBe(false)
  })
})

describe('notifications', () => {
  it('only interrupt when the window is not in front, except money', () => {
    expect(shouldNotify('permission', false)).toBe(true)
    expect(shouldNotify('permission', true)).toBe(false)
    expect(shouldNotify('finished', true)).toBe(false)
    expect(shouldNotify('budget', true)).toBe(true)
  })
})
