import { describe, expect, it } from 'vitest'
import { runnable } from './runnable'

describe('a code block in a reply that can be run in the terminal', () => {
  it('is a shell block, or a one-line block with no language, and anything else is left alone', () => {
    expect(runnable('bash', 'npm test')).toBe('npm test')
    expect(runnable('sh', 'ls -la')).toBe('ls -la')
    expect(runnable('zsh', 'echo hi')).toBe('echo hi')
    expect(runnable('console', '$ git status')).toBe('git status')
    expect(runnable('', 'agy plugin install ./aw-spike')).toBe('agy plugin install ./aw-spike')
    expect(runnable('ts', 'const a = 1')).toBeNull()
    expect(runnable('json', '{"a":1}')).toBeNull()
    // Several lines with no language are as likely to be output or a diagram as commands.
    expect(runnable('', 'a\nb\nc')).toBeNull()
    expect(runnable('mermaid', 'graph TD')).toBeNull()
    expect(runnable('bash', '   \n')).toBeNull()
  })

  it('drops the prompt a command is written with: "! " is Claude\'s shell mode and "$ " a shell prompt, neither is part of the command', () => {
    expect(runnable('', '! agy plugin install /tmp/x')).toBe('agy plugin install /tmp/x')
    expect(runnable('bash', '$ npm i\n$ npm test')).toBe('npm i\nnpm test')
    expect(runnable('bash', '# install first\nnpm i\nnpm test')).toBe('# install first\nnpm i\nnpm test')
    expect(runnable('bash', 'echo "$HOME"')).toBe('echo "$HOME"')
  })
})
