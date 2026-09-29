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

export { monaco }
