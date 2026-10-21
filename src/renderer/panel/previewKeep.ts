/** How many agents' Previews stay loaded (hidden) behind the one on screen: each is a live web page. */
export const PREVIEWS_KEPT = 3

/** The agents whose Preview stays loaded after `opened` was opened: the last few, newest last. An agent that is asleep keeps its page too: the page is the person's, whether or not the program runs. */
export function keepPreviews(kept: string[], opened: string): string[] {
  return [...kept.filter((id) => id !== opened), opened].slice(-PREVIEWS_KEPT)
}
