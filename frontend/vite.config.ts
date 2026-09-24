import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Acceso LAN: http://192.168.101.34:5173 (y localhost en el servidor).
    host: '0.0.0.0',
    port: 5173,
    // Proxy same-origin → cookies Sanctum/XSRF (clientes LAN no usan localhost:8000).
    // El target es local al PC servidor; PostgreSQL/Laravel siguen en 127.0.0.1.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/sanctum': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
