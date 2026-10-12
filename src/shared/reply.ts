/** The first JSON object in a reply that parses, whatever prose or code fence surrounds it. */
export function jsonIn(reply: string): unknown {
  const end = reply.lastIndexOf('}')
  for (let i = reply.indexOf('{'); i !== -1 && i < end; i = reply.indexOf('{', i + 1)) {
    try {
      return JSON.parse(reply.slice(i, end + 1))
    } catch {
      // not an object from here; try the next brace
    }
  }
  return null
}
