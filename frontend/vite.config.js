import { defineConfig } from 'vite'
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/geoserver': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
