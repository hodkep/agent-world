import type { MermaidConfig } from 'mermaid'

/** A diagram in a reply is sketched by hand, like Excalidraw, in the app's brass and cyan on its dark panels; its words are in the reading font. */
export const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  look: 'handDrawn',
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  themeVariables: { fontSize: '15px', primaryColor: '#221e33', primaryBorderColor: '#f2c230', primaryTextColor: '#e4e4ee', lineColor: '#f2c230', secondaryColor: '#17142a', tertiaryColor: '#12101a', clusterBkg: '#17142a', clusterBorder: '#6ad0e0', edgeLabelBackground: '#17142a', noteBkgColor: '#2e2a18', noteTextColor: '#e4e4ee', noteBorderColor: '#f2c230' }
}
