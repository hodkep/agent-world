import { describe, expect, it } from 'vitest'
import { planReply } from './plan'
import { stepDeclined, stepReply, stepSkipped, stepStarted } from './steps'
import { parseWorkflowMessage } from './workflowMessage'

const office = (t: string) => `[Agent World] ${t}`

describe('what the app typed into the chat for the person, read back as a receipt', () => {
  it('knows a plan that was approved, with the note they wrote', () => {
    expect(parseWorkflowMessage(office(planReply('approved', {})))).toMatchObject({ tone: 'ok', icon: 'tick', title: 'Plan approved', told: office(planReply('approved', {})) })
    expect(parseWorkflowMessage(office(planReply('approved', { note: 'Keep it small.' })))).toMatchObject({ title: 'Plan approved', sub: 'Keep it small.' })
  })
  it('knows a plan sent back, and a hold lifted without approval', () => {
    expect(parseWorkflowMessage(office(planReply('changes', { note: 'Cover settings.' })))).toMatchObject({ tone: 'back', title: 'Plan sent back', sub: 'Cover settings.' })
    expect(parseWorkflowMessage(office(planReply('released', {})))).toMatchObject({ tone: 'skip', title: 'Hold lifted' })
  })
  it('knows Run, a skip, a refusal, and a step approved or sent back', () => {
    expect(parseWorkflowMessage(office(stepStarted('Review')))).toMatchObject({ tone: 'go', icon: 'run', title: 'Run', sub: 'Review' })
    expect(parseWorkflowMessage(office(stepSkipped('UI design options', 'Build')))).toMatchObject({ tone: 'skip', icon: 'skip', title: 'Skipped UI design options' })
    expect(parseWorkflowMessage(office(stepDeclined('Pull request')))).toMatchObject({ tone: 'no', icon: 'cross', title: 'Refused Pull request' })
    expect(parseWorkflowMessage(office(stepReply('Commit', 'approved', 'Looks good')))).toMatchObject({ tone: 'ok', title: 'Commit approved', sub: 'Looks good' })
    expect(parseWorkflowMessage(office(stepReply('Commit', 'changes', 'Shorter message', 'work')))).toMatchObject({ tone: 'back', title: 'Commit sent back', sub: 'Shorter message' })
  })
  it('knows the push that was approved, which is typed without the prefix', () => {
    const text = 'The person approved the push of aw/tester (0a898d3). Push a branch whose head is exactly this commit, your own branch or another name for the same commit (git push origin aw/tester:<name>), and open the pull request. Do not add commits first: a branch with other commits is held.'
    expect(parseWorkflowMessage(text)).toMatchObject({ tone: 'ok', icon: 'push', title: 'Push approved', sub: 'aw/tester at 0a898d3', told: text })
  })
  it('leaves what the person wrote, and another agent\'s mail, alone', () => {
    expect(parseWorkflowMessage('Please add a dark mode')).toBeNull()
    expect(parseWorkflowMessage('[Agent World] Message from ada: hi')).toBeNull()
    expect(parseWorkflowMessage('The person pressed Run: start your step "x" now.')).toBeNull()
  })
})
