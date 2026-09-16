// Vite の ?raw 取り込み（検査で原文を走査するために用いる）。
declare module '*?raw' {
  const content: string;
  export default content;
}
