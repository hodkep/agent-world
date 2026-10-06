/** Claude marks the option it prefers by ending its title with "(Recommended)"; that is shown as a badge, not as part of the words. */
export function splitRecommended(label: string): { title: string; recommended: boolean } {
  const m = /^(.*\S)\s*\(recommended\)\s*$/i.exec(label)
  return m ? { title: m[1]!, recommended: true } : { title: label, recommended: false }
}
