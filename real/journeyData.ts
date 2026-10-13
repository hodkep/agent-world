/** The task and workflow the real-program journeys share. The project's check asks for more than the request says (accents removed), so a real agent's first try is likely to fail it. */
export const JOURNEY = {
  version: 1,
  id: 'journey',
  name: 'Journey',
  when: "Every change to this project's code, a new function included.",
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve' },
    { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change and commit it.' },
    { id: 'tests', kind: 'check', name: 'Project check', run: `node -e "const { slugify } = require('./slug.js'); const a = require('node:assert'); a.strictEqual(slugify('Hello World'), 'hello-world'); a.strictEqual(slugify('Café au lait'), 'cafe-au-lait'); console.log('ok')"`, gate: 'pass', retries: 2 },
    { id: 'review', kind: 'audit' },
    { id: 'land', kind: 'merge', gate: 'approve' }
  ]
}
export const REQUEST = 'Add a `slugify(text)` function to slug.js that lowercases the text, trims it and replaces runs of spaces with single hyphens. Export it, add a test file slug.test.js (plain node assert) covering empty text, extra spaces and mixed case, make sure the tests pass with node, and commit it all with a clear message.'
