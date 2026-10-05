import type { AgentProfile } from '../../shared/types'
import type { Role } from '../world/worldState'

/** Everything the profile card needs for one agent, gathered from what the app holds. */
export interface CardData {
  id: string
  name: string
  role: Role
  roleLabel: string
  activity: string
  model: string
  effort: string
  /** The permission mode, in words. */
  mode: string
  /** Empty for an agent that works in the folder itself. */
  branch: string
  ctx: number | null
  costUsd: number
  /** For a program that counts tokens rather than dollars. */
  tokens?: { input: number; output: number; context: number } | null
  budgetUsd?: number
  add: number
  del: number
  profile: AgentProfile | null
  /** What can be edited, as the choices in use (the model alias, the thinking level, the permission mode). */
  modelId: string
  effortId: string
  modeId: string
  /** Settings can be changed now: it is not in the middle of a turn. */
  canSwitch: boolean
}
