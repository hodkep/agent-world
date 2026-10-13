import { describe, expect, it } from 'vitest'
import { editedFiles } from './edited'

const tool = (name: string, input: Record<string, unknown>, at: number) => ({ kind: 'tool' as const, id: `t${at}`, at, toolUseId: `u${at}`, name, input })

describe('editedFiles', () => {
  it('lists the files an agent wrote or edited since a time, relative to its folder, once each', () => {
    const items = [
      tool('Edit', { file_path: '/work/shop/old.ts' }, 50),
      tool('Edit', { file_path: '/work/shop/src/main/library/service.ts' }, 150),
      tool('Write', { file_path: '/work/shop/src/main/library/service.ts' }, 160),
      tool('MultiEdit', { file_path: '/work/shop/src/renderer/chat/ChatView.tsx' }, 170),
      tool('Read', { file_path: '/work/shop/README.md' }, 180),
      tool('Bash', { command: 'ls' }, 190)
    ]
    expect(editedFiles(items, '/work/shop', 100)).toEqual(['src/main/library/service.ts', 'src/renderer/chat/ChatView.tsx'])
  })
  it('leaves out files outside its folder', () => {
    expect(editedFiles([tool('Write', { file_path: '/tmp/notes.md' }, 150)], '/work/shop', 100)).toEqual([])
  })
})
