import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

// Defaults: src/main, src/preload, src/renderer → out/. No "type": "module", so main and
// preload build as CommonJS (sandboxed preloads must be CJS). @tether/core is a devDependency,
// so it gets bundled instead of externalized. tether-mcp (packages/mcp) builds next to main as
// out/main/mcp.js, run by TETHER.exe with ELECTRON_RUN_AS_NODE=1.
export default defineConfig({
  main: {
    build: {
      rolldownOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts'), mcp: resolve(__dirname, '../../packages/mcp/src/index.ts') },
      },
    },
  },
  preload: {},
  renderer: {},
})
