export type FileKind = 'html' | 'markdown' | 'pdf' | 'image' | 'code' | 'text' | 'other' | 'folder'

/** A file an agent mentioned, once it is known to exist. */
export interface FileInfo {
  path: string
  name: string
  kind: FileKind
  size: number
  /** Inside the agent's own folder (so the Code tab can show it). */
  inside: boolean
  /** Where it is within the agent's folder (the name the Code tab uses), when inside. */
  rel?: string
}
