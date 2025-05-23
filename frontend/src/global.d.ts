declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
} 

// --- 新增：Vite 环境变量类型声明 ---
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // 在这里添加其他 Vite 环境变量
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
// --- 结束新增 --- 