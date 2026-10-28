import { fileIconName } from './fileIconName'

// Every bundled icon by its name; the build turns each into a file (or a data address) of its own.
const urls = import.meta.glob('../assets/fileIcons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const url = (name: string) => urls[`../assets/fileIcons/${name}.svg`] ?? urls['../assets/fileIcons/file.svg']

/** The icon of a file or folder, beside its name; it says nothing a reader needs, so it is hidden from them. */
export function FileIcon({ path, dir, open }: { path: string; dir?: boolean; open?: boolean }) {
  return <img className="fi" src={url(fileIconName(path, { dir, open }))} alt="" width={16} height={16} draggable={false} />
}
