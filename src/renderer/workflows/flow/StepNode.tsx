import { Handle, type Node, type NodeProps, Position } from '@xyflow/react'
import type { SkillState } from '../../../shared/skills'
import { type Step, stepName } from '../../../shared/workflow'
import { PixelIcon } from '../../chat/PixelIcon'
import { SKILL_WORDS } from '../WorkflowList'
import { ACTOR, ACTOR_WORD, BRIEF_KINDS, KIND_LABEL, chipsOf } from './stepFlow'

export type StepNodeData = { step: Step; index: number; /** The checker has something to say about this step. */ problem?: boolean; skillStates?: Record<string, SkillState> }
export type StepFlowNode = Node<StepNodeData, 'step'>

/** One step as a card in the flow: who does it, its name and what it is told, and the chips that say where it stops. */
export function StepNode({ data, selected }: NodeProps<StepFlowNode>) {
  const { step, index, problem, skillStates } = data
  const actor = ACTOR[step.kind]
  const text = step.kind === 'check' ? step.run : BRIEF_KINDS.includes(step.kind) ? step.brief : undefined
  return (
    <div className={`fl-node a-${actor} ${selected ? 'sel' : ''} ${problem ? 'bad' : ''}`}>
      <Handle id="top" type="target" position={Position.Top} isConnectable={false} />
      <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={false} />
      <Handle id="loop-out" type="source" position={Position.Right} isConnectable={false} />
      <Handle id="loop-in" type="target" position={Position.Right} isConnectable={false} />
      <div className="fl-head">
        <span className="fl-who" title={`Done by ${ACTOR_WORD[actor]}`}>
          <PixelIcon name={actor === 'reviewer' ? 'review' : (actor as 'agent' | 'command' | 'you')} />
        </span>
        <b className="fl-name">{stepName(step)}</b>
        <span className="fl-n" aria-hidden="true">{index + 1}</span>
      </div>
      <p className={`fl-text ${step.kind === 'check' ? 'mono' : ''}`}>{text || <span className="fl-none">{KIND_LABEL[step.kind]} · {ACTOR_WORD[actor]}</span>}</p>
      <div className="fl-chips">
        {chipsOf(step, skillStates).map((c) => <span key={c.text} className={`fl-chip ${c.tone} ${c.skill ?? ''}`} title={c.skill ? SKILL_WORDS[c.skill] : undefined}>{c.text}</span>)}
      </div>
    </div>
  )
}
