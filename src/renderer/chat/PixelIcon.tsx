// 8x8 bitmaps drawn as crisp squares, so icons keep the pixel-art look at any zoom.
const ICONS = {
  plus: ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'],
  send: ['...##...', '..####..', '.######.', '########', '...##...', '...##...', '...##...', '...##...'],
  // Run: the usual play triangle.
  play: ['.#......', '.###....', '.#####..', '.#######', '.#####..', '.###....', '.#......', '........'],
  stop: ['........', '.######.', '.######.', '.######.', '.######.', '.######.', '.######.', '........'],
  dots: ['........', '........', '........', '##.##.##', '##.##.##', '........', '........', '........'],
  back: ['...#....', '..##....', '.#######', '..##....', '...#....', '........', '........', '........'],
  review: ['.####...', '#....#..', '#....#..', '#....#..', '.####...', '.....##.', '......##', '.......#'],
  clone: ['#####...', '#...#...', '#...#...', '#####...', '..#####.', '..#...#.', '..#...#.', '..#####.'],
  book: ['.#####..', '##...##.', '##.#.##.', '##...##.', '##.#.##.', '##...##.', '.#####..', '........'],
  tools: ['..###...', '.#..#...', '.#.##...', '..##....', '...##...', '....##..', '.....##.', '......#.'],
  flag: ['#.......', '######..', '#######.', '######..', '#.......', '#.......', '#.......', '#.......'],
  pencil: ['.....##.', '....###.', '...###..', '..###...', '.###....', '###.....', '##......', '........'],
  tag: ['######..', '#....#..', '#.##.#..', '#....#..', '######..', '........', '........', '........'],
  x: ['##....##', '###..###', '.######.', '..####..', '..####..', '.######.', '###..###', '##....##'],
  chevron: ['#.....#', '.#...#.', '..#.#..', '...#...'],
  // The profile card's size toggle: corners pointing out, corners pointing in.
  expand: ['###..###', '#......#', '#......#', '........', '........', '#......#', '#......#', '###..###'],
  shrink: ['........', '.##..##.', '.#....#.', '........', '........', '.#....#.', '.##..##.', '........'],
  // The profile card's menu tick.
  check: ['......#.', '.....##.', '#...##..', '##.##...', '.###....', '..#.....', '........', '........']
} as const

export type IconName = keyof typeof ICONS

/** The same icon as markup, for buttons that are made outside React (the ones put on code blocks in a reply). */
export function pixelIconMarkup(name: IconName, scale = 2): string {
  const rows: readonly string[] = ICONS[name]
  const w = rows[0]!.length
  const d = rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x} ${y}h1v1h-1z` : ''))).join('')
  return `<svg class="pxi" width="${w * scale}" height="${rows.length * scale}" viewBox="0 0 ${w} ${rows.length}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}"/></svg>`
}

/** `scale` is whole screen pixels per art pixel, so edges stay sharp. */
export function PixelIcon({ name, scale = 2 }: { name: IconName; scale?: number }) {
  const rows: readonly string[] = ICONS[name]
  const w = rows[0]!.length
  return (
    <svg className="pxi" width={w * scale} height={rows.length * scale} style={{ width: w * scale, height: rows.length * scale }} viewBox={`0 0 ${w} ${rows.length}`} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      <path d={rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x} ${y}h1v1h-1z` : ''))).join('')} />
    </svg>
  )
}
