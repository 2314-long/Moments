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
      /**
       * 临时产物（截图、浏览器 profile、编辑器写文件时的中转目录）
       * 不参与热更新监听，否则这些目录里的文件会被占用（EBUSY），
       * 直接让整个 dev server 崩掉。
       *
       * 其中 `.README.md.*.tmpdir/**` 是编辑器保存 README 时产生的
       * 中转目录 —— 它出现在仓库根目录，曾实测把 dev server 打崩。
       */
      ignored: [
        '**/.dsh-tmp/**',
        '**/.dsh-vision-toolkit/**',
        '**/dist/**',
        '**/*.tmpdir/**',
        '**/*.tmp',
      ],
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
})
