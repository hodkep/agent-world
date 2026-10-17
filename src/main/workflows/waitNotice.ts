/**
 * Which agents have been told a check waits for the person to approve its commands. An agent is told once for each check and version of the workflow file,
 * not on every step report, so its chat does not fill with the same message and its answers to it; the person's answer starts it over.
 */
export class WaitNotices {
  private told = new Map<string, string>()

  /** True the first time for this agent and key (a check's name with the file's version), false while that same one still waits. */
  firstTime(agentId: string, key: string): boolean {
    if (this.told.get(agentId) === key) return false
    this.told.set(agentId, key)
    return true
  }

  /** The person answered: the next wait is news again. */
  answered(agentId: string) {
    this.told.delete(agentId)
  }
}
