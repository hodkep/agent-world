import { type WorkflowPrefs, usesNoWorkflow } from '../../shared/workflows'

/**
 * The running agents of a project that started before its workflow was set: before Workflows was switched on, or before the project's workflow file last
 * changed. An agent gets the workflow tools and its reminder only when it launches, so these have neither until they restart. A file's time has fractions of
 * a millisecond and the launch time does not: whole milliseconds are compared, or an agent started in the same one looks stale.
 */
export function staleAgents(o: { agents: { id: string; name: string; online: boolean; launchedAt: number }[]; project: string; workflows: WorkflowPrefs; changedAt: number }): { id: string; name: string }[] {
  if (!o.workflows.enabled || usesNoWorkflow(o.workflows, o.project)) return []
  const changed = Math.floor(Math.max(o.workflows.since, o.changedAt))
  return o.agents.filter((a) => a.online && a.launchedAt > 0 && a.launchedAt < changed).map(({ id, name }) => ({ id, name }))
}
