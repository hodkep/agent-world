/**
 * The chat's tool vocabulary: the one set of names (and the shape of each one's input) that the conversation knows how to draw.
 * A program that calls its tools by other names gives the chat a ToolTranslator that says them in this vocabulary, so the same
 * work looks the same whoever did it. The chat never learns a program's names; programs learn the chat's.
 */
export interface ToolCall {
  name: string
  input: Record<string, unknown>
}

/** A call as a program's own transcript names it. */
export interface RawCall {
  id: string
  name: string
  args: Record<string, unknown>
}

/** A call as the chat draws it; `id` is what its result is matched with. */
export interface TranslatedCall extends ToolCall {
  id: string
}

export interface ToolTranslator {
  /** One program call as the chat's calls: usually one, several when it starts several things at once, as if called alone when it has no name here. */
  translate(raw: RawCall): TranslatedCall[]
  /** The answer to this call says nothing the chat should print (it is shown elsewhere, like each subagent's own answer). */
  silentResult(name: string): boolean
}

/** The names the chat has a card for. MCP calls are `mcp__server__tool`. */
export const CANONICAL_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent'] as const
export const isCanonicalTool = (name: string) => (CANONICAL_TOOLS as readonly string[]).includes(name) || /^mcp__.+__.+$/.test(name)

const s = (v: unknown) => (typeof v === 'string' ? v : '')

/** Builders for each call, so no translator has to know the shape of an input. */
export const call = {
  bash: (command: string, description?: string): ToolCall => ({ name: 'Bash', input: { command, ...(description && { description }) } }),
  read: (file_path: string): ToolCall => ({ name: 'Read', input: { file_path } }),
  write: (file_path: string, content: string): ToolCall => ({ name: 'Write', input: { file_path, content } }),
  edit: (file_path: string, old_string: string, new_string: string): ToolCall => ({ name: 'Edit', input: { file_path, old_string, new_string } }),
  multiEdit: (file_path: string, edits: { old_string: string; new_string: string }[]): ToolCall => ({ name: 'MultiEdit', input: { file_path, edits } }),
  glob: (pattern: string, path = ''): ToolCall => ({ name: 'Glob', input: { pattern, path } }),
  grep: (pattern: string, path = ''): ToolCall => ({ name: 'Grep', input: { pattern, path } }),
  webFetch: (url: string): ToolCall => ({ name: 'WebFetch', input: { url } }),
  webSearch: (query: string): ToolCall => ({ name: 'WebSearch', input: { query } }),
  agent: (description: string, subagent_type: string, prompt = ''): ToolCall => ({ name: 'Agent', input: { description, subagent_type, prompt } }),
  mcp: (server: string, tool: string, input: Record<string, unknown> = {}): ToolCall => ({ name: `mcp__${server || 'server'}__${tool || 'tool'}`, input })
}

/** What one entry of a program's table returns: a single call, or one per thing started (`id` then names each). */
export type Mapper = (args: Record<string, unknown>, id: string) => ToolCall | TranslatedCall[]

/**
 * A translator from a table of the program's tool names to mappers. A name not in the table is passed on as it is and drawn as a
 * plain card, so a new tool never breaks the chat; adding it is one more line in the table (open for extension, closed for change).
 */
export function tableTranslator(table: Record<string, Mapper>, silent: string[] = []): ToolTranslator {
  return {
    translate({ id, name, args }) {
      const mapper = table[name]
      if (!mapper) return [{ id, name, input: args }]
      const out = mapper(args, id)
      return Array.isArray(out) ? out : [{ id, ...out }]
    },
    silentResult: (name) => silent.includes(name)
  }
}

/** For a program whose tools already carry the chat's names (Claude Code's do). */
export const identityTranslator: ToolTranslator = tableTranslator({})

/** Arguments are often missing or of another type: a text, or nothing. */
export const text = s
