import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/image-proxy': {
        target: 'https://platform-outputs.agnes-ai.space',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image-proxy/, '')
      }
    }
  }
})
