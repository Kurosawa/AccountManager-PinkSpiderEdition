// テストで SQL・設定ファイルを文字列として読む(Vite の ?raw)
declare module '*?raw' {
  const text: string
  export default text
}
