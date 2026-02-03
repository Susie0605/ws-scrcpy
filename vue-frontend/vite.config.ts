import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    // 构建时不进行类型检查
    target: 'esnext'
  },
  // 配置 esbuild
  esbuild: {
    // 忽略 TypeScript 错误
    drop: ['console', 'debugger'],
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
    }
  },
  define: {
    'global': {},
  }
})
