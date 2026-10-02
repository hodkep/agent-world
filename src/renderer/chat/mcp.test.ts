import { describe, expect, it } from 'vitest'
import { argRows, humanize, mcpHeadline, parseMcpName, resultNote, resultSections, toolLookup } from './mcp'

describe('MCP tool names', () => {
  it('splits server and tool, even when the server name has dashes', () => {
    expect(parseMcpName('mcp__playwright__browser_navigate')).toEqual({ server: 'playwright', tool: 'browser_navigate' })
    expect(parseMcpName('mcp__claude-in-chrome__tabs_context_mcp')).toEqual({ server: 'claude-in-chrome', tool: 'tabs_context_mcp' })
    expect(parseMcpName('Bash')).toBeNull()
  })
  it('turns a tool name into words', () => {
    expect(humanize('browser_take_screenshot')).toBe('Take screenshot')
    expect(humanize('list_tables')).toBe('List tables')
  })
})

describe('the headline of an MCP call', () => {
  it('says what a navigation opened', () => {
    expect(mcpHeadline('browser_navigate', { url: 'https://experts.snorkel-ai.com/home' })).toEqual({ verb: 'Opened', target: 'experts.snorkel-ai.com/home', link: 'https://experts.snorkel-ai.com/home' })
  })
  it('knows the common browser tools', () => {
    expect(mcpHeadline('browser_snapshot', {}).verb).toBe('Read the page')
    expect(mcpHeadline('browser_take_screenshot', {}).verb).toBe('Took a screenshot')
    expect(mcpHeadline('browser_click', { element: 'Sign in button', ref: 'e12' })).toEqual({ verb: 'Clicked', target: 'Sign in button' })
  })
  it('puts a SQL statement on one line', () => {
    expect(mcpHeadline('execute_sql', { query: 'select *\n  from teams limit 5' })).toEqual({ verb: 'Ran SQL', target: 'select * from teams limit 5' })
  })
  it('turns list_/get_ tools into sentences, and falls back to the tool name with its first argument', () => {
    expect(mcpHeadline('list_tables', { schemas: ['public'] }).verb).toBe('Listed tables')
    expect(mcpHeadline('some_odd_tool', { thing: 'x' })).toEqual({ verb: 'Some odd tool', target: 'x' })
  })
})

describe('arguments and results', () => {
  it('lists arguments as rows, skipping empty ones', () => {
    expect(argRows({ url: 'https://a.b', empty: '', n: 5, o: { a: 1 } })).toEqual([['url', 'https://a.b'], ['n', '5'], ['o', '{"a":1}']])
  })
  it('splits a markdown result into titled parts with their code', () => {
    const r = resultSections("### Ran Playwright code\n```js\nawait page.goto('x');\n```\n### Page\n- Page URL: x\n- Page Title: T")
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ title: 'Ran Playwright code', code: [{ lang: 'js', text: "await page.goto('x');" }] })
    expect(r[1]).toMatchObject({ title: 'Page', text: '- Page URL: x\n- Page Title: T' })
  })
  it('keeps text before any heading and an unclosed fence', () => {
    expect(resultSections('plain words')).toEqual([{ title: '', text: 'plain words' }])
    expect(resultSections('### A\n```yaml\nk: v')[0]!.code).toEqual([{ lang: 'yaml', text: 'k: v' }])
  })
  it('notes the page title, row count or line count', () => {
    expect(resultNote('browser_snapshot', '### Page\n- Page Title: Snorkel AI Experts Portal')).toBe('Snorkel AI Experts Portal')
    expect(resultNote('execute_sql', '[{"a":1},{"a":2}]')).toBe('2 rows')
    expect(resultNote('x', 'a\nb\nc')).toBe('3 lines')
  })
})

describe('tool lookups', () => {
  it('lists the tools a select: call loads', () => {
    expect(toolLookup({ query: 'select:mcp__playwright__browser_snapshot,mcp__playwright__browser_take_screenshot' })).toEqual({
      kind: 'load',
      tools: [
        { server: 'playwright', tool: 'browser_snapshot' },
        { server: 'playwright', tool: 'browser_take_screenshot' }
      ]
    })
  })
  it('keeps plain names that are not from an MCP server', () => {
    expect(toolLookup({ query: 'select:WebSearch' })).toEqual({ kind: 'load', tools: [{ server: '', tool: 'WebSearch' }] })
  })
  it('says what a keyword search looked for and how many came back', () => {
    expect(toolLookup({ query: '+slack send' }, '<function>{}</function>\n<function>{}</function>')).toEqual({ kind: 'search', query: 'slack send', found: 2 })
    expect(toolLookup({ query: 'notebook' })).toEqual({ kind: 'search', query: 'notebook', found: null })
  })
})
