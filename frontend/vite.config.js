import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 配置代理，解决CORS问题
    proxy: {
      // 将所有/api开头的请求代理到后端服务器
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
        // 可以重写路径，如果需要的话
        // rewrite: (path) => path.replace(/^\/api/, '')
      },
      // 添加健康检查接口的代理
      '/health-check': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      }
    },
    // 开发服务器端口
    port: 3000,
    // 自动打开浏览器
    open: true,
    // 热更新
    hmr: true,
  },
  // 构建配置
  build: {
    outDir: 'build',
    sourcemap: true,
    // 分割代码块
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // 其他大型依赖库可以在这里添加
        },
      },
    },
  },
}); 