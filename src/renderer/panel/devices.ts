export type DeviceKind = 'desktop' | 'tablet' | 'mobile'
export interface Preset {
  name: string
  w: number
  h: number
}
/** The screen sizes the Preview can show a page at. Desktop is the panel's own width; the others are real devices, scaled to fit. */
export const DEVICES: Record<DeviceKind, { label: string; blurb: string; presets: Preset[] }> = {
  desktop: { label: 'Desktop', blurb: 'full width of the panel', presets: [] },
  tablet: {
    label: 'Tablet',
    blurb: '820 × 1180',
    presets: [
      { name: 'iPad Air', w: 820, h: 1180 },
      { name: 'iPad mini', w: 744, h: 1133 },
      { name: 'Galaxy Tab', w: 800, h: 1280 }
    ]
  },
  mobile: {
    label: 'Mobile',
    blurb: '390 × 844',
    presets: [
      { name: 'iPhone 14', w: 390, h: 844 },
      { name: 'iPhone SE', w: 375, h: 667 },
      { name: 'Pixel 7', w: 412, h: 915 }
    ]
  }
}

/** How a device announces itself to the page, so a site that sends different pages to phones sends the phone one. */
export const USER_AGENT: Record<Exclude<DeviceKind, 'desktop'>, string> = {
  tablet: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
}

/** The size of a device in the shape it is held, or null for desktop (which has no fixed size). */
export function sizeOf(kind: DeviceKind, preset: string, rotated: boolean): { w: number; h: number } | null {
  if (kind === 'desktop') return null
  const p = DEVICES[kind].presets.find((x) => x.name === preset) ?? DEVICES[kind].presets[0]!
  return rotated ? { w: p.h, h: p.w } : { w: p.w, h: p.h }
}

/**
 * The size and kind of frame the page gets: the size an agent's browser tool set, when it set one (a phone-sized page is drawn in a phone's frame), otherwise the device
 * you chose. The page is really resized, not told to pretend: a page laid out at a size it does not have draws wrong.
 */
export function frameOf(own: { w: number; h: number } | null, agent: { w: number; h: number; label: string } | null | undefined): { size: { w: number; h: number } | null; kind: DeviceKind | null } {
  if (!agent) return { size: own, kind: null }
  return { size: { w: agent.w, h: agent.h }, kind: agent.label === 'phone' ? 'mobile' : agent.label === 'tablet' ? 'tablet' : 'desktop' }
}

/**
 * How wide to make the frame for a device of a given width, as a multiple of that width. The page itself says: `inner` is the width it sees, `shown` the width its frame has here,
 * and a frame that shows a page this many pixels wide as that many pixels is one pixel per pixel. (The app's own zoom and the page's are both in play, and which one wins has differed;
 * measuring is the one way to be sure the page sees 390 when asked for 390.) `guess` is used until there is a measure.
 */
export const pageScale = (inner: number, shown: number, guess: number) => (Number.isFinite(inner) && inner > 0 && Number.isFinite(shown) && shown > 0 ? shown / inner : guess)

/** How much to shrink a device of this size to fit the room, leaving a little around it; it is never enlarged. */
export const fitScale = (w: number, h: number, roomW: number, roomH: number) => Math.min(1, (roomW - 24) / w, (roomH - 24) / h)

/** The view a page was seen in, as it is named in the message: the device and the viewport it had. */
export const viewOf = (kind: DeviceKind, size: { w: number; h: number }) => ({ label: DEVICES[kind].label, ...size })
