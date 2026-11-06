/** How many agents' Previews stay loaded (hidden) behind the one on screen: each is a live web page. */
export const PREVIEWS_KEPT = 3

/**
 * The agents whose Preview stays loaded after `opened` was opened: the last few, newest last. An agent that is asleep keeps its page too: the page is the person's, whether or not the program runs.
 * The page of an agent whose browser tool is connected (`pinned`) is never the one let go: the tool is working on it.
 */
export function keepPreviews(kept: string[], opened: string, pinned: string[] = []): string[] {
  const list = [...kept.filter((id) => id !== opened), opened]
  let over = list.length - PREVIEWS_KEPT
  return list.filter((id) => (over > 0 && id !== opened && !pinned.includes(id) ? (over--, false) : true))
}
