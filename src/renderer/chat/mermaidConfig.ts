import type { MermaidConfig } from 'mermaid'

// The app's tokens (styles.css), as Mermaid wants them: plain hex. Mermaid draws what it has no variable for in black, and black does not show on our dark panels.
const BG = '#12101a'
const TEXT = '#e4e4ee'
const MUTED = '#a4a2b8'
const LINE = '#2c3350'
const BRASS = '#f2c230'
const CYAN = '#6ad0e0'
const VIOLET = '#b38bff'
const GREEN = '#7fcf7f'
/** Branch lines (git graph) and section outlines, in the order Mermaid takes them. */
const HUES = [BRASS, CYAN, VIOLET, GREEN, '#ff9f6b', '#ff7fb0', '#8fb4ff', '#d4d46a']
/** Dark fills of the same hues, for the boxes and bars that carry words. */
const WELLS = ['#2e2a18', '#16313a', '#2a2140', '#1d3320', '#3a2619', '#3a1f2c', '#1c2a4a', '#33331a']
const each = (f: (i: number) => [string, string][]) => Object.fromEntries(HUES.flatMap((_, i) => f(i)))

/** A diagram in a reply is sketched by hand, like Excalidraw, in the app's brass and cyan on its dark panels; its words are in the reading font. */
export const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  look: 'handDrawn',
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  // Commit labels are kept and turned along the line, so they do not run over the tags.
  gitGraph: { showCommitLabel: true, rotateCommitLabel: true },
  themeVariables: {
    fontSize: '15px', primaryColor: '#221e33', primaryBorderColor: BRASS, primaryTextColor: TEXT, lineColor: BRASS, secondaryColor: '#17142a', tertiaryColor: BG,
    clusterBkg: '#17142a', clusterBorder: CYAN, edgeLabelBackground: '#17142a', noteBkgColor: '#2e2a18', noteTextColor: TEXT, noteBorderColor: BRASS,
    textColor: TEXT, titleColor: TEXT, mainBkg: '#221e33', nodeBorder: BRASS, nodeTextColor: TEXT,
    // Git graph: a bright line and dot per branch, its name in dark on that colour, commit labels light, tags in brass.
    ...each((i) => [[`git${i}`, HUES[i]!], [`gitInv${i}`, BG], [`gitBranchLabel${i}`, BG]]),
    commitLabelColor: TEXT, commitLabelBackground: '#221e33', commitLabelFontSize: '13px',
    tagLabelColor: BRASS, tagLabelBackground: '#2e2a18', tagLabelBorder: BRASS, tagLabelFontSize: '13px',
    // Mindmap and timeline: a dark fill and a bright edge per section.
    ...each((i) => [[`cScale${i}`, WELLS[i]!], [`cScaleInv${i}`, HUES[i]!], [`cScaleLabel${i}`, TEXT], [`cScalePeer${i}`, HUES[i]!]]),
    // Gantt.
    taskBkgColor: WELLS[0]!, taskBorderColor: BRASS, taskTextColor: TEXT, taskTextLightColor: TEXT, taskTextDarkColor: TEXT, taskTextOutsideColor: TEXT, taskTextClickableColor: CYAN,
    activeTaskBkgColor: WELLS[1]!, activeTaskBorderColor: CYAN, doneTaskBkgColor: WELLS[3]!, doneTaskBorderColor: GREEN, critBkgColor: WELLS[5]!, critBorderColor: HUES[5]!,
    gridColor: LINE, sectionBkgColor: '#17142a', altSectionBkgColor: BG, sectionBkgColor2: '#1a1726', todayLineColor: HUES[5]!,
    // Quadrant chart.
    quadrant1Fill: WELLS[3]!, quadrant2Fill: WELLS[0]!, quadrant3Fill: '#1a1726', quadrant4Fill: WELLS[1]!,
    quadrant1TextFill: TEXT, quadrant2TextFill: TEXT, quadrant3TextFill: MUTED, quadrant4TextFill: TEXT,
    quadrantPointFill: BRASS, quadrantPointTextFill: TEXT, quadrantXAxisTextFill: MUTED, quadrantYAxisTextFill: MUTED, quadrantTitleFill: TEXT,
    quadrantInternalBorderStrokeFill: LINE, quadrantExternalBorderStrokeFill: BRASS,
    // Sequence and entity-relationship diagrams.
    attributeBackgroundColorOdd: '#17142a', attributeBackgroundColorEven: '#1d1930',
    actorBkg: '#221e33', actorBorder: BRASS, actorTextColor: TEXT, actorLineColor: '#6a6888', signalColor: TEXT, signalTextColor: TEXT,
    labelBoxBkgColor: '#221e33', labelBoxBorderColor: BRASS, labelTextColor: TEXT, loopTextColor: TEXT, activationBkgColor: '#2e2a18', activationBorderColor: BRASS, sequenceNumberColor: BG
  }
}
