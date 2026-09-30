/** Some apps wrap copied text in <pasted_content id="…"> … </pasted_content id="…"> markers. They are not part of the message. */
const MARK = /^[ \t]*<\/?pasted_content\b[^>\n]*>[ \t]*\n?/gim

export const unwrapPasted = (text: string) => (text.includes('pasted_content') ? text.replace(MARK, '') : text)
