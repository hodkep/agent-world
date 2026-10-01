import { describe, expect, it } from 'vitest'
import { bashTitle } from './titles'

const t = (command: string, description?: string) => bashTitle({ command, description })

describe('the title of a command card', () => {
  it('uses the description the agent gave, after "Ran"', () => expect(t('ls src', 'List the source folder')).toEqual({ text: 'List the source folder', ran: true }))
  it('says what a file write did', () => {
    expect(t("cat > e2e/plugin-skills.e2e.ts <<'EOF'\nimport x\nEOF").text).toBe('Wrote e2e/plugin-skills.e2e.ts')
    expect(t('echo hi > notes.txt').text).toBe('Wrote notes.txt')
  })
  it('says what a read did', () => {
    expect(t('cat src/main/index.ts').text).toBe('Read src/main/index.ts')
    expect(t('sed -n 596,665p src/renderer/App.tsx').text).toBe('Read lines 596–665 of src/renderer/App.tsx')
    expect(t('head -20 README.md').text).toBe('Read the start of README.md')
  })
  it('says what a search looked for', () => {
    expect(t('grep -n "listCommands(" src/main/index.ts | head').text).toBe('Searched for “listCommands(” in src/main/index.ts')
    expect(t('rg -i foo').text).toBe('Searched for “foo”')
  })
  it('names common git, test and build commands', () => {
    expect(t('git status --short').text).toBe('Checked git status')
    expect(t('npx vitest run').text).toBe('Ran the tests')
    expect(t('npx playwright test e2e/a.e2e.ts').text).toBe('Ran the end-to-end tests')
    expect(t('pnpm run dist').text).toBe('Built the project')
    expect(t('npx tsc --noEmit -p .').text).toBe('Checked types')
  })
  it('summarizes the first step of a chain and counts the rest', () => {
    expect(t('cd /x/y && ls src; git status; npm test').text).toBe('Listed src (+2 more)')
  })
  it('falls back to the command itself, cut short, after "Ran"', () => {
    const r = t('some-unknown-tool --flag value another very long argument list that just keeps going and going on')
    expect(r.ran).toBe(true)
    expect(r.text.endsWith('…')).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(72)
  })
  it('has a word for an empty command', () => expect(bashTitle({})).toEqual({ text: 'a command', ran: true }))
})
