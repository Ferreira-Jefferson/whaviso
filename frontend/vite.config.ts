/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const src = fileURLToPath(new URL('./src', import.meta.url))
  // QA harness (dev-only): so em `vite --mode qa` o apiClient real e trocado pelo fake de mocks.
  // No build de producao (mode 'production') esse alias NAO existe, entao nada do harness vaza.
  const alias: { find: string | RegExp; replacement: string }[] = [{ find: '@', replacement: src }]
  if (mode === 'qa') {
    alias.unshift({
      find: /^@\/shared\/api_client$/,
      replacement: fileURLToPath(new URL('./src/qa/fakes/api_client.ts', import.meta.url)),
    })
  }
  return {
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Placeholders publicos so para os testes (nenhum segredo): o client supabase exige as vars.
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_SUPABASE_URL: 'http://supabase.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'chave-publica-de-teste',
    },
  },
  }
})
