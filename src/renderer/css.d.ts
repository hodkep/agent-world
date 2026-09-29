declare module '*.css'
declare module '*?worker' {
  const Worker: { new (): Worker }
  export default Worker
}
