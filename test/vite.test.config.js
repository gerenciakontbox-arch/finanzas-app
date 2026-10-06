import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
const real = path.resolve(__dirname, '../src/lib/supabase.js')
const mock = path.resolve(__dirname, 'supabase.mock.js')
export default defineConfig({
  plugins: [react(), { name: 'mock-supabase', enforce: 'pre', resolveId(src, importer) { if (importer && src.startsWith('.')) { let r = path.resolve(path.dirname(importer), src); if (!r.endsWith('.js') && !r.endsWith('.jsx')) r += '.js'; if (r === real) return mock } } }],
  build: { outDir: 'test/dist', emptyOutDir: true, sourcemap: false }, logLevel: 'error' })
