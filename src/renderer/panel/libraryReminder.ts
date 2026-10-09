/** The per-message reminder for the Playbook preview: the text once, then when it is sent (hard rules ride on every message, the rest only when a message points at something). */
export function describeReminder(reminder: string, hardIds: string[]): string {
  if (!reminder) return ''
  return `${reminder} ${hardIds.length ? `Rules marked hard (${hardIds.join(', ')}) are reminded on every message.` : 'Only on a message that points at something.'}`
}
