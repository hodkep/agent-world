/** What a page in Preview may ask for: only fullscreen (a video player's F key). Camera, microphone, location and the rest stay refused. */
export const previewAllows = (permission: string): boolean => permission === 'fullscreen'
