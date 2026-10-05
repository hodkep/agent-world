import { join } from 'node:path'
import type { PaletteCommand } from '../../../shared/commands'
import { skills } from '../shared/skills'

const built = (name: string, description: string, args = false): PaletteCommand => ({ name, description, source: 'built-in', args })

// agy's own slash commands worth a click, as its completion list names them (agy 1.2.17). Menus it opens itself are included because the terminal is right there.
const BUILT_INS: PaletteCommand[] = [
  built('clear', 'Clear the conversation and start again'),
  built('context', 'Show what is using the context window'),
  built('rewind', 'Go back to an earlier message'),
  built('fork', 'Branch the current conversation'),
  built('btw', 'Ask a side question without interrupting the current task', true),
  built('usage', 'Show model quota usage'),
  built('help', 'Show the commands and keybindings'),
  built('model', 'Choose the model, or run one prompt on another model', true),
  built('effort', 'Set the reasoning effort', true),
  built('mcp', 'Manage MCP servers'),
  built('agents', 'List the available custom agents'),
  built('skills', 'List the available skills'),
  built('permissions', 'See and change what agy may do without asking'),
  built('hooks', 'Manage hook configurations for tool events'),
  built('config', "Open agy's settings"),
  built('diff', 'View uncommitted changes and per-turn diffs'),
  built('tasks', 'View background tasks'),
  built('add-dir', 'Add a folder to the workspace', true),
  built('resume', 'Browse and resume past conversations'),
  built('rename', 'Rename the current conversation', true),
  built('copy', 'Copy the last answer to the clipboard'),
  built('changelog', 'Show release notes')
]

/** agy's built-ins, and the skills it finds for a workspace: the project's `.agents/skills` and your own folders under ~/.gemini. */
export const agyCommands = {
  async list(cwd: string, home: string): Promise<PaletteCommand[]> {
    const groups = await Promise.all([
      skills(join(cwd, '.agents', 'skills'), 'project skill'),
      skills(join(home, '.gemini', 'skills'), 'your skill'),
      skills(join(home, '.gemini', 'antigravity', 'skills'), 'your skill'),
      skills(join(home, '.gemini', 'antigravity-cli', 'skills'), 'your skill')
    ])
    const seen = new Set<string>()
    return [BUILT_INS, ...groups].flat().filter((c) => !seen.has(c.name) && seen.add(c.name))
  }
}
