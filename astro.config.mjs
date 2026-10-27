// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

import vercel from '@astrojs/vercel';

// https://astro.build/config
// Datos en PostgreSQL vía src/modules/shared/servidor/db.ts (ADR-010)
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()]
  },
  output: 'server',
  adapter: vercel()
});
