import type { Pt } from './office'

export type CatStep = { kind: 'walk'; to: Pt } | { kind: 'rest'; what: 'nap' | 'sit' | 'desk'; ms: number }

/** Where the cat can go: places to curl up, places to wander to, and the tiles in front of the desks it may climb on. */
export interface CatSpots {
  nap: Pt[]
  roam: Pt[]
  desks: Pt[]
}

const WEIGHTS = { nap: 3, sit: 2, desk: 1 }

/** What the cat does next: a walk, then a rest (a long nap, a sit to wash, or a spell on a desk). Never the same rest twice running. It draws nothing and moves nothing. */
export class CatBrain {
  private last: keyof typeof WEIGHTS | null = null

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1
  ) {}

  private pick<T>(xs: T[]): T {
    return xs[Math.min(xs.length - 1, Math.floor(this.rand() * xs.length))]!
  }

  next(spots: CatSpots): CatStep[] {
    const kinds = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).filter((k) => k !== this.last && (k !== 'desk' || spots.desks.length > 0))
    let r = this.rand() * kinds.reduce((n, k) => n + WEIGHTS[k], 0)
    let what = kinds[kinds.length - 1]!
    for (const k of kinds) {
      r -= WEIGHTS[k]
      if (r < 0) {
        what = k
        break
      }
    }
    this.last = what
    const ms = (lo: number, span: number) => Math.round((lo + Math.floor(this.rand() * span)) / this.speed)
    switch (what) {
      case 'nap':
        return [{ kind: 'walk', to: this.pick(spots.nap) }, { kind: 'rest', what, ms: ms(20_000, 20_000) }]
      case 'desk':
        return [{ kind: 'walk', to: this.pick(spots.desks) }, { kind: 'rest', what, ms: ms(6000, 6000) }]
      default:
        return [{ kind: 'walk', to: this.pick(spots.roam) }, { kind: 'rest', what, ms: ms(4000, 5000) }]
    }
  }
}
