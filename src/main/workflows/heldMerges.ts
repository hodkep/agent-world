import type { LandingHold } from '../../shared/api'

/**
 * The merges into the base branch that git held back, one for each agent, waiting for the person's word. "Not yet" keeps the entry, declined, so the
 * marker on the run's track stays and the band does not; the agent trying again and being held again brings the band back.
 */
export class HeldMerges {
  private held = new Map<string, LandingHold>()

  hold(agentId: string, head: string, held: string[]) {
    this.held.set(agentId, { agentId, head, held, declined: false })
  }

  decline(agentId: string) {
    const h = this.held.get(agentId)
    if (h) this.held.set(agentId, { ...h, declined: true })
  }

  reopen(agentId: string) {
    const h = this.held.get(agentId)
    if (h) this.held.set(agentId, { ...h, declined: false })
  }

  /** The agent's held merge, removed from the list: the person allowed it. */
  take(agentId: string): LandingHold | undefined {
    const h = this.held.get(agentId)
    this.held.delete(agentId)
    return h
  }

  clear(agentId: string) {
    this.held.delete(agentId)
  }

  list(): LandingHold[] {
    return [...this.held.values()]
  }
}
