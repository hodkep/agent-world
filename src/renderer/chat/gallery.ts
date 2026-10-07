/** How many of a message's pictures are shown as tiles before the rest are said as "+n more". */
export const GALLERY_MAX = 3

export function galleryShown(total: number): { shown: number; more: number } {
  return { shown: Math.min(total, GALLERY_MAX), more: Math.max(0, total - GALLERY_MAX) }
}

/** The picture one step on, in the viewer: it stops at the first and the last, and never moves by itself. */
export function stepPicture(index: number, dir: 1 | -1, total: number): number {
  if (total <= 1) return 0
  return Math.max(0, Math.min(total - 1, index + dir))
}

/** One picture of a message, as the viewer is given it. */
export interface Shot {
  src: string
  label: string
}

/** The pictures of a message and which one was opened. */
export interface PictureSet {
  pictures: Shot[]
  index: number
}
