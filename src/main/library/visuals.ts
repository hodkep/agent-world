import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderDoc } from './doc'
import { Playbooks } from './playbook'

export const VISUALS_ID = 'chat-visuals'
export const FORMS_ID = 'chat-forms'
/** When an agent should read the form format: the playbook rule's "when" line. */
export const FORMS_WHEN = 'you need the person to choose or fill in several things, and a form in the chat (A2UI) beats a list of questions'

const SOURCE = 'built-in'

// The chat draws Mermaid diagrams and A2UI forms (chat/markdown.tsx, chat/a2ui.ts). The first is short enough to be put in an agent's opening text; the second is read when a form is needed.
const VISUALS = `The chat draws more than text. Choose these on your own, without being asked:
- Explaining how three or more parts connect, steps that follow each other, states, a data model or a plan over time: put a diagram first, in a fenced \`\`\`mermaid block (flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, classDiagram, gantt, mindmap, timeline, gitGraph, quadrantChart), then a few lines. Never ASCII boxes and arrows. Draw only what you have read or were told; say so when there is nothing to connect.
- Facts with several columns: a markdown table. Maths: LaTeX.
- Two or more questions for the person, or options for them to choose between: a form, not a list. Read ${FORMS_ID} first with library_get for the format.
Short answers and a single question stay plain text.`

const FORMS = `A form in the chat is a fenced \`\`\`a2ui block of A2UI v0.9 JSON messages: one JSON list, or one message a line.
- createSurface: {"version":"v0.9","createSurface":{"surfaceId":"x","catalogId":"basic"}}
- updateComponents: a flat list of components with ids; the root has the id "root"; a parent names its children by id (Row and Column: "children": [ids]; Card and Button: "child": id).
- updateDataModel: {"version":"v0.9","updateDataModel":{"surfaceId":"x","path":"/","value":{...}}}, the starting values the components bind to with {"path":"/name"}.
Components: Text (text, variant h1-h5, body or caption), Row, Column (children, justify, align), Card (child), Divider, Button (child: a Text id; variant "primary"; action: {"event":{"name":"...","context":{"key":{"path":"/name"}}}}), TextField (label, value, variant shortText or obscured), CheckBox (label, value true or false), ChoicePicker (label, options [{"label","value"}], value a list, variant mutuallyExclusive or multipleSelection), Slider (label, min, max, value). Nothing else is drawn: a block with another component, a missing child or no root is shown as plain code.
Pressing a Button sends you its action as your next message, with the context read from the form as it was left: {"version":"v0.9","action":{"name","surfaceId","sourceComponentId","timestamp","context"}}. Show one form at a time, then wait for the answer, and tell the person in a line what it is for.
Example: {"version":"v0.9","updateComponents":{"surfaceId":"x","components":[{"id":"root","component":"Card","child":"col"},{"id":"col","component":"Column","children":["t","pick","go"]},{"id":"t","component":"Text","variant":"h3","text":"Which first?"},{"id":"pick","component":"ChoicePicker","label":"Task","variant":"mutuallyExclusive","options":[{"label":"Tests","value":"tests"},{"label":"Docs","value":"docs"}],"value":{"path":"/task"}},{"id":"go","component":"Button","variant":"primary","child":"gol","action":{"event":{"name":"chosen","context":{"task":{"path":"/task"}}}}},{"id":"gol","component":"Text","text":"Start"}]}}`

const ITEMS = [
  { id: VISUALS_ID, name: 'Chat visuals', description: 'Draw diagrams, tables and forms in the chat on your own, where they say it better than words.', body: VISUALS },
  { id: FORMS_ID, name: 'Chat forms', description: 'How to ask the person several things at once with a form in the chat (A2UI): the format and the components.', body: FORMS }
]

/**
 * Keeps the two library items about drawing in the chat the same as the wording the app ships, and puts a rule for each in the Everywhere
 * playbook, once: a person who takes a rule out keeps it out, or can change how it applies. The words of the items follow the app, as the guide's do.
 */
export function syncVisuals(o: { root: string }) {
  mkdirSync(join(o.root, 'instructions'), { recursive: true })
  for (const i of ITEMS) {
    const file = join(o.root, 'instructions', `${i.id}.md`)
    const text = renderDoc({ name: i.name, description: i.description, body: i.body, meta: { source: SOURCE } })
    const current = (() => {
      try {
        return readFileSync(file, 'utf8')
      } catch {
        return ''
      }
    })()
    if (current !== text) writeFileSync(file, text)
  }
  const marker = join(o.root, 'playbooks', '.visuals-rule')
  if (existsSync(marker)) return
  const playbooks = new Playbooks(o.root)
  const rules = playbooks.read('global')
  const add = [
    { id: VISUALS_ID, mode: 'always' as const, when: '', strength: 'soft' as const },
    { id: FORMS_ID, mode: 'on-demand' as const, when: FORMS_WHEN, strength: 'soft' as const }
  ].filter((r) => !rules.some((x) => x.id === r.id))
  playbooks.write('global', [...rules, ...add])
  mkdirSync(join(o.root, 'playbooks'), { recursive: true })
  writeFileSync(marker, VISUALS_ID)
}
