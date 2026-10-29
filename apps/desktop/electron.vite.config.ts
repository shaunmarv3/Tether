import { defineConfig } from 'electron-vite'

// Defaults: src/main, src/preload, src/renderer → out/. No "type": "module", so main and
// preload build as CommonJS (sandboxed preloads must be CJS). @tether/core is a devDependency,
// so it gets bundled instead of externalized.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {},
})
