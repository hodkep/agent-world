import { Container, Graphics, Sprite } from 'pixi.js'
import { BOX, SCOOTER, SCOOTER_COLORS, SCOOTER_KEYS } from './scooter'
import { pixelTexture } from './sprites'
import { STAFF_KEYS, staffPixels, staffTexture } from './staffSprites'
import type { Trip } from './trip'

export type RiderKind = 'courier' | 'pizza'
const SCOOTER_H = SCOOTER.length
/** The rider seated on the scooter: the staff figure from the side, cut off at the hips. */
const seated = (kind: RiderKind) => pixelTexture(staffPixels(kind, 'side', 'stand').slice(0, 18), STAFF_KEYS[kind]!, `rider/${kind}/seated`)

/** A courier or a pizza delivery on the street: the scooter with its rider while it rides, and the rider alone, on foot, between the kerb and the door. */
export class RiderView {
  readonly view = new Container()
  private readonly bike = new Container()
  private readonly scooter = new Sprite()
  private readonly box = new Sprite()
  private readonly rider = new Sprite()
  private readonly foot = new Sprite()
  private readonly shadow = new Graphics()

  constructor(private readonly kind: RiderKind) {
    const [body, shade] = SCOOTER_COLORS[kind]
    this.scooter.texture = pixelTexture(SCOOTER, SCOOTER_KEYS(body, shade), `scooter/${kind}`)
    this.box.texture = pixelTexture(BOX, SCOOTER_KEYS(body, shade), `scooter/${kind}/box`)
    this.rider.texture = seated(kind)
    this.rider.position.set(3, -9)
    this.box.position.set(2, -1)
    this.box.visible = kind === 'pizza'
    this.bike.addChild(this.shadow, this.scooter, this.box, this.rider)
    this.view.addChild(this.bike, this.foot)
    this.shadow.rect(1, SCOOTER_H - 1, 22, 2).fill({ color: 0x000000, alpha: 0.35 })
  }

  update(trip: Trip, t: number) {
    const walking = trip.mode === 'walk' || trip.mode === 'return'
    this.bike.visible = trip.mode !== 'gone'
    this.rider.visible = trip.onScooter
    this.bike.position.set(Math.round(trip.scooter.x), Math.round(trip.scooter.y - SCOOTER_H))
    this.foot.visible = walking
    if (walking) {
      this.foot.texture = staffTexture(this.kind, trip.mode === 'walk' ? 'back' : 'front', Math.floor(t / 150) % 2 ? 'walk1' : 'walk2')
      this.foot.position.set(Math.round(trip.rider.x - 8), Math.round(trip.rider.y - 24))
    }
    this.view.zIndex = trip.scooter.y
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}
