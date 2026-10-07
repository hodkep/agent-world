import { type Mapper, call, tableTranslator, text } from '../../../shared/tools'

/** One call that starts subagents is one Agent call for each, named by its place in it: agy answers all of them in one line. */
export const subagentCallId = (callId: string, index: number) => `${callId}:${index}`

type Spawn = { Prompt?: string; Role?: string; TypeName?: string }

/**
 * agy's tools in the chat's vocabulary. The names and arguments are agy's own (seen in its conversations and in the schemas it carries).
 * To teach the chat another agy tool, add its line here: nothing else changes.
 */
const table: Record<string, Mapper> = {
  run_command: (a) => call.bash(text(a.CommandLine), text(a.toolAction)),
  view_file: (a) => call.read(text(a.AbsolutePath) || text(a.Path) || text(a.File)),
  view_file_outline: (a) => call.read(text(a.AbsolutePath) || text(a.Path)),
  write_to_file: (a) => call.write(text(a.TargetFile), text(a.CodeContent)),
  replace_file_content: (a) => call.edit(text(a.TargetFile), text(a.TargetContent), text(a.ReplacementContent)),
  multi_replace_file_content: (a) =>
    call.multiEdit(
      text(a.TargetFile),
      (Array.isArray(a.ReplacementChunks) ? (a.ReplacementChunks as Record<string, unknown>[]) : []).map((c) => ({ old_string: text(c.TargetContent), new_string: text(c.ReplacementContent) }))
    ),
  grep_search: (a) => call.grep(text(a.Query), text(a.SearchPath)),
  find_by_name: (a) => call.glob(text(a.Pattern), text(a.SearchDirectory)),
  list_dir: (a) => call.glob('*', text(a.DirectoryPath)),
  read_url_content: (a) => call.webFetch(text(a.Url)),
  search_web: (a) => call.webSearch(text(a.query)),
  call_mcp_tool: (a) => call.mcp(text(a.ServerName), text(a.ToolName), a.Arguments && typeof a.Arguments === 'object' ? (a.Arguments as Record<string, unknown>) : {}),
  // Seen in agy's conversations: a timer that wakes it after DurationSeconds with a prompt, or sooner when the conversation named in TimerCondition reports.
  schedule: (a) => call.schedule({ inSeconds: typeof a.DurationSeconds === 'number' ? a.DurationSeconds : 0 }, '', text(a.Prompt)),
  invoke_subagent: (a, id) =>
    (Array.isArray(a.Subagents) ? (a.Subagents as Spawn[]) : []).map((s, i) => ({
      id: subagentCallId(id, i),
      ...call.agent(s.Role ?? (s.Prompt ?? '').replace(/\s+/g, ' ').slice(0, 80), s.TypeName ?? 'subagent', s.Prompt ?? '')
    }))
}

/** `invoke_subagent` is answered with one line naming the conversations; each subagent's own answer is shown with it instead. */
export const agyCalls = tableTranslator(table, ['invoke_subagent'])

/** One real call of each kind, as agy writes them: the contract test turns each into something the chat draws. */
export const agyCallSamples = [
  { id: 'a', name: 'run_command', args: { CommandLine: 'ls -la', toolAction: 'List files' } },
  { id: 'a', name: 'view_file', args: { AbsolutePath: '/p/a.ts' } },
  { id: 'a', name: 'view_file_outline', args: { AbsolutePath: '/p/a.ts' } },
  { id: 'a', name: 'write_to_file', args: { TargetFile: '/p/a.ts', CodeContent: 'x' } },
  { id: 'a', name: 'replace_file_content', args: { TargetFile: '/p/a.ts', TargetContent: 'x', ReplacementContent: 'y', StartLine: 1, EndLine: 1, AllowMultiple: false } },
  { id: 'a', name: 'multi_replace_file_content', args: { TargetFile: '/p/a.ts', ReplacementChunks: [{ TargetContent: 'x', ReplacementContent: 'y' }] } },
  { id: 'a', name: 'grep_search', args: { Query: 'todo', SearchPath: '/p' } },
  { id: 'a', name: 'find_by_name', args: { Pattern: '*.ts', SearchDirectory: '/p' } },
  { id: 'a', name: 'list_dir', args: { DirectoryPath: '/p' } },
  { id: 'a', name: 'read_url_content', args: { Url: 'https://example.com' } },
  { id: 'a', name: 'search_web', args: { query: 'weather' } },
  { id: 'a', name: 'call_mcp_tool', args: { ServerName: 'agent-world', ToolName: 'list_agents', Arguments: {} } },
  { id: 'a', name: 'schedule', args: { DurationSeconds: 10, Prompt: 'Wait for subagent to finish', TimerCondition: '0df393c6-f8e6-478a-9950-73f9d4117afa', toolAction: 'Scheduling check', toolSummary: 'Timer schedule' } },
  { id: 'a', name: 'invoke_subagent', args: { Subagents: [{ Prompt: 'Look around', TypeName: 'research' }] } }
]
