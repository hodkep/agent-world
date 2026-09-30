/** Text that makes Claude read the given files, as typed into its input box (no Enter). */
export function mentionText(paths: string[]): string {
  return paths
    // Control characters would press keys in the terminal; quotes would end the mention early.
    .map((p) => p.replace(/[\x00-\x1f\x7f"]/g, '').trim())
    .filter(Boolean)
    .map((p) => `@"${p}" `)
    .join('')
}
