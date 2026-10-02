/** The line that ends a delivered message, telling the recipient whether to answer. Shared so the chat can tell it from the sender's words. */
export const replyTail = (fromName: string) => `When you have an answer, reply using the agent-world send_message tool with to="${fromName}" and expects_reply=false.`
export const noReplyTail = 'This is a reply to you. No reply is needed; carry on with your task.'

export interface AgentMail {
  from: string
  body: string
  expectsReply: boolean
}

const head = /^\[Agent World\] Message from ([^:\n]+): /

/** What another agent sent, taken apart from the text that was typed into this agent's terminal; null for anything else. */
export function parseAgentMail(text: string): AgentMail | null {
  const m = head.exec(text)
  if (!m) return null
  const from = m[1]!
  let body = text.slice(m[0].length)
  const expectsReply = body.endsWith(`\n\n${replyTail(from)}`)
  for (const tail of [replyTail(from), noReplyTail]) if (body.endsWith(`\n\n${tail}`)) body = body.slice(0, -tail.length - 2)
  return { from, body, expectsReply }
}
