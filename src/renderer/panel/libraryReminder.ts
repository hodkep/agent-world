/** The reminder for the Playbook preview: the text once, then when it is sent. */
export function describeReminder(reminder: string): string {
  if (!reminder) return ''
  return `${reminder} Sent with the first message, every fourth one after, after a compaction and after a long pause.`
}
