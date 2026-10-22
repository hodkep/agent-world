import { remoteReader } from '../shared/remoteScreen'

/** Claude Code prints "/remote-control is active · … https://claude.ai/code/session_…" once, at launch. */
export const claudeRemote = remoteReader(/https:\/\/claude\.ai\/code\/session_[\w-]+/)
