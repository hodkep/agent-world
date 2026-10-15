/** The per-message reminder for the Playbook preview: the text once, then when it is sent (hard rules ride on every message, medium ones on every third, soft ones not at all). */
export function describeReminder(reminder: string, hardIds: string[]): string {
  if (!reminder) return ''
  return `${reminder} ${hardIds.length ? `Rules marked hard (${hardIds.join(', ')}) are reminded on every message.` : 'Medium rules are reminded on every third message; soft ones only in the opening text.'}`
}
