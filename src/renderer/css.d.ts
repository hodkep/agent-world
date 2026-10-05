declare module '*.css'
declare module '*?worker' {
  const Worker: { new (): Worker }
  export default Worker
}
declare module '*.svg' { const url: string; export default url }
declare module '*.png' { const url: string; export default url }
