/** What a diagram in a reply adds to the message box: its Mermaid source as text (exact and cheap for the agent to read), and the boxes picked in it. */
export function diagramContext(source: string, picked: string[]): { label: string; text: string } {
  const names = [...new Set(picked.map((p) => p.trim()).filter(Boolean))]
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
  const lead = names.length ? `I picked these in the diagram: ${names.join(', ')}.\n\n` : ''
  return { label: names.length ? `diagram, picked ${shown}` : 'diagram', text: `${lead}The diagram (Mermaid):\n\`\`\`mermaid\n${source.trim()}\n\`\`\`` }
}
