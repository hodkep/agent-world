/** Agent names are how agents address each other and how branches are labelled, so keep them plain. */
export const cleanName = (raw: string) => raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20)

/** The cleaned name, or an error if it is empty or another agent already has it. */
export function checkName(raw: string, others: string[]): string {
  const name = cleanName(raw)
  if (!name) throw new Error('Give the agent a name (letters, digits and dashes).')
  if (others.includes(name)) throw new Error(`There is already an agent named ${name}.`)
  return name
}
