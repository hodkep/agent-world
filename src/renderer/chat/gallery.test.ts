import { describe, expect, it } from 'vitest'
import { GALLERY_MAX, galleryShown, stepPicture } from './gallery'

describe('pictures shown with a message', () => {
  it('shows up to three, and says how many more there are', () => {
    expect(GALLERY_MAX).toBe(3)
    expect(galleryShown(1)).toEqual({ shown: 1, more: 0 })
    expect(galleryShown(3)).toEqual({ shown: 3, more: 0 })
    expect(galleryShown(6)).toEqual({ shown: 3, more: 3 })
    expect(galleryShown(4)).toEqual({ shown: 3, more: 1 })
    expect(galleryShown(0)).toEqual({ shown: 0, more: 0 })
  })
})

describe('stepping through the pictures in the viewer', () => {
  it('moves one at a time and stops at the ends instead of wrapping round', () => {
    expect(stepPicture(0, 1, 5)).toBe(1)
    expect(stepPicture(4, -1, 5)).toBe(3)
    expect(stepPicture(0, -1, 5)).toBe(0)
    expect(stepPicture(4, 1, 5)).toBe(4)
  })
  it('stays put with one picture, or none', () => {
    expect(stepPicture(0, 1, 1)).toBe(0)
    expect(stepPicture(0, 1, 0)).toBe(0)
  })
})
