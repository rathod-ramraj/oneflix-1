import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_PORT = 5173;
const API_PORT = 3001;

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ['framer-motion'],
        },
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'log-local-url',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const url = `http://localhost:${DEV_PORT}`;
          console.log(`\n  ONEFLIX frontend: ${url}`);
          console.log(`  API proxy:        ${url}/api → http://localhost:${API_PORT}/api\n`);
        });
      },
    },
  ],
  server: {
    port: DEV_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
