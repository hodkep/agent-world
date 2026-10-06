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

/** How much to shrink a device of this size to fit the room, leaving a little around it; it is never enlarged. */
export const fitScale = (w: number, h: number, roomW: number, roomH: number) => Math.min(1, (roomW - 24) / w, (roomH - 24) / h)

/** The view a page was seen in, as it is named in the message: the device and the viewport it had. */
export const viewOf = (kind: DeviceKind, size: { w: number; h: number }) => ({ label: DEVICES[kind].label, ...size })
