import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['test/javascript/**/*.test.js'],
    environment: 'node',
    setupFiles: ['./test/javascript/setup.js'],
  },
  resolve: {
    alias: {
      'lib': path.resolve(__dirname, 'app/javascript/lib'),
      'marked': path.resolve(__dirname, 'test/javascript/mocks/marked.js'),
      // Vendored (not an npm dep); its own @codemirror/* imports still resolve
      // from node_modules like the other editor packages.
      '@replit/codemirror-vim': path.resolve(__dirname, 'vendor/javascript/@replit--codemirror-vim.js'),
      '@hotwired/turbo-rails': path.resolve(__dirname, 'test/javascript/mocks/turbo-rails.js'),
      '@rails/request.js': path.resolve(__dirname, 'test/javascript/mocks/requestjs.js'),
    },
  },
})
