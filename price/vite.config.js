import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],

  server: {
    proxy: {
      '/options': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },

      '/expirations': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },

      '/pdufa-watch': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },

      '/History': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/PDUFAHistory': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
    },
    },
  },
})