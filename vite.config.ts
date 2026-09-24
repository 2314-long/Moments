import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    host: '127.0.0.1',
    watch: {
      // 临时产物（截图、浏览器 profile）不参与热更新监听，
      // 否则 Chrome 的缓存文件会触发 EBUSY 让整个 dev server 崩掉
      ignored: ['**/.dsh-tmp/**', '**/.dsh-vision-toolkit/**', '**/dist/**'],
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
})
