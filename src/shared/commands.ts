export interface PaletteCommand {
  name: string
  description: string
  source: 'built-in' | 'project skill' | 'project command' | 'your skill' | 'your command' | 'plugin skill' | 'plugin command'
  /** Takes free-text arguments after the name. */
  args: boolean
}
