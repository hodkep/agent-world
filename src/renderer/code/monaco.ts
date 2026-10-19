import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

// One generic worker: syntax colouring works for every language; deep TS/JSON language services are left out
// to keep the bundle small (add their workers here when in-app type checking matters).
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

monaco.editor.defineTheme('agent-world', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0c0b12',
    'editor.lineHighlightBackground': '#1a1726',
    'editorGutter.background': '#0c0b12',
    'editor.selectionBackground': '#f2c23055',
    'diffEditor.insertedTextBackground': '#5f9e5f33',
    'diffEditor.removedTextBackground': '#d83a3a33',
    'diffEditor.insertedLineBackground': '#5f9e5f1f',
    'diffEditor.removedLineBackground': '#d83a3a1f'
  }
})

export function languageFor(path: string) {
  const dot = path.lastIndexOf('.')
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : ''
  return monaco.languages.getLanguages().find((l) => l.extensions?.includes(ext))?.id ?? 'plaintext'
}

export const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  theme: 'agent-world',
  automaticLayout: true,
  minimap: { enabled: false },
  fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
  fontSize: 12,
  scrollBeyondLastLine: false
}

/**
 * The old side's numbers in an inline diff sit in a strip of their own, sized from the numbers' width; at the editor's default of 5 characters
 * the strip is narrower than the box Monaco puts it in, so the editor covers the right-most digit (10 to 39 read as 1, 2, 3). From 7 characters the strip is wide enough for four digits.
 */
export const ORIGINAL_NUMBER_CHARS = 7

export { monaco }
