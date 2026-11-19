import type { OfficeAsset } from './files'
import viewerHtml from './office/viewer.html?raw'
import frameJs from './office/frame.js?raw'
// The libraries that read the files, taken into the app's own bundle: the viewer page loads them from the app's page server, never from the network.
import jszip from '../../node_modules/jszip/dist/jszip.min.js?raw'
import docxPreview from '../../node_modules/docx-preview/dist/docx-preview.min.js?raw'
import xlsx from '../../node_modules/xlsx/dist/xlsx.mini.min.js?raw'
import pptxPreview from '../../node_modules/pptx-preview/dist/pptx-preview.umd.js?raw'

const js = (body: string): OfficeAsset => ({ type: 'text/javascript; charset=utf-8', body })

export const officeAssets: Record<string, OfficeAsset> = {
  'viewer.html': { type: 'text/html; charset=utf-8', body: viewerHtml },
  'frame.js': js(frameJs),
  'jszip.js': js(jszip),
  'docx.js': js(docxPreview),
  'xlsx.js': js(xlsx),
  'pptx.js': js(pptxPreview)
}
