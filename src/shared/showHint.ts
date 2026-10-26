/**
 * What every agent is told about the chat it answers in: it draws Mermaid diagrams and A2UI forms (see chat/markdown.tsx and
 * chat/a2ui.ts), so an agent picks them on its own where they say more than words, with nothing asked of it by the person.
 */
export const SHOW_HINT = `The chat draws more than text. Choose these on your own, without being asked, where they say it better than words:
- A diagram (architecture, flow, sequence, data model, states, timeline, plan): a fenced \`\`\`mermaid block (flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, mindmap, timeline, gitGraph, pie, quadrantChart). Never ASCII boxes and arrows.
- A comparison or list of facts with several columns: a markdown table. Maths: LaTeX.
- When you need the person to choose or fill in several things, a form instead of a list of questions: a fenced \`\`\`a2ui block of A2UI v0.9 JSON messages (createSurface, updateComponents as a flat list with ids and the root id "root", updateDataModel for the starting values). Components: Text (variant h1-h5, body, caption), Row, Column, Card, Divider, Button (child id; action.event.name and context of {"path": "/x"} values; pressing it sends the answer to you as the next message), TextField, CheckBox, ChoicePicker (options [{label, value}], value a list), Slider (min, max). Bind values with {"path": "/x"}. One form at a time, then wait for the answer. Use a plain question when one short question will do.
Keep ordinary answers as plain text: a picture only where it helps.`
