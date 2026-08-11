import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // This demo renders with the React implementation in ../packages.
  // React Compiler depends on APIs from the official React runtime (for
  // example useMemoCache), so enabling it crashes custom function components.
  plugins: [react()],
})
