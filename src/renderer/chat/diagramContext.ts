/** What a diagram in a reply adds to the message box: its Mermaid source as text (exact and cheap for the agent to read), and the boxes picked in it. */
export function diagramContext(source: string, picked: string[]): { label: string; text: string } {
  const names = [...new Set(picked.map((p) => p.trim()).filter(Boolean))]
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
  const numbered = names.some((n) => /^message \d+:/.test(n)) ? ' The message numbers count the arrows from the top of the diagram, in the order they are written below.' : ''
  const lead = names.length ? `I picked these boxes in the diagram (the words written on them): ${names.join(', ')}. Arrows cannot be picked, so my question is about these boxes and how they connect in the diagram below.${numbered}\n\n` : ''
  return { label: names.length ? `diagram, picked ${shown}` : 'diagram', text: `${lead}The diagram (Mermaid):\n\`\`\`mermaid\n${source.trim()}\n\`\`\`` }
}
