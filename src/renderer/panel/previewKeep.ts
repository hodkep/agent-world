/** How many agents' Previews stay loaded (hidden) behind the one on screen: each is a live web page. */
export const PREVIEWS_KEPT = 3

/** The agents whose Preview stays loaded after `opened` was opened: the last few, newest last, without any that has gone to sleep. */
export function keepPreviews(kept: string[], opened: string, asleep: (id: string) => boolean): string[] {
  return [...kept.filter((id) => id !== opened && !asleep(id)), opened].slice(-PREVIEWS_KEPT)
}
