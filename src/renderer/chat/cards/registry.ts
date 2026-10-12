import type { ComponentType } from 'react'
import type { ToolRun } from '../ToolCard'

/** A call as the chat has it: the tool's name and what it was given. */
export interface ToolCall {
  name: string
  input: Record<string, unknown>
}

export interface ToolCardProps {
  run: ToolRun
  agentId: string
  /** The agent is still working, so a call without an answer is in flight, not lost. */
  working: boolean
}

/** A card of its own for one family of tool calls. Adding one is a file that calls `registerToolCard`; nothing in the chat names a tool. */
export interface ToolCardModule {
  /** Names the card, so loading its file twice registers it once. */
  id: string
  /** Which calls this card draws. */
  match: (call: ToolCall) => boolean
  Card: ComponentType<ToolCardProps>
}

const cards: ToolCardModule[] = []

export function registerToolCard(m: ToolCardModule) {
  if (!cards.some((c) => c.id === m.id)) cards.push(m)
}

/** The card that owns a call; undefined means the generic card draws it. The first registered wins. */
export const toolCardFor = (call: ToolCall): ToolCardModule | undefined => cards.find((m) => m.match(call))

/** For tests. */
export const resetToolCards = () => void (cards.length = 0)
