import { defineConfig } from 'electron-vite'
import solid from 'vite-plugin-solid'
import path from 'path'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/main.ts')
      },
      rollupOptions: {
        external: ['chokidar', 'electron', 'better-sqlite3']
      }
    },
    resolve: {
      alias: {
        '@electron': path.resolve(__dirname, 'electron')
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/preload.ts')
      },
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html')
      }
    },
    plugins: [solid()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    }
  }
})
