import { defineConfig } from 'vite';

const apiProxy = { '/api': `http://127.0.0.1:${process.env.PORT ?? '8787'}` };

export default defineConfig({
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
