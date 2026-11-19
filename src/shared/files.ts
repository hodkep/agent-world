/** `word`, `sheet` (Excel and CSV) and `slides` are Office files shown read-only by the viewer. */
export type FileKind = 'html' | 'markdown' | 'pdf' | 'image' | 'code' | 'text' | 'word' | 'sheet' | 'slides' | 'other' | 'folder'

/** A CSV or TSV: text to edit that can also be read as a table. */
export const isCsv = (name: string) => /\.(csv|tsv)$/i.test(name)

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
