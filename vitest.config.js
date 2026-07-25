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
      '@hotwired/turbo-rails': path.resolve(__dirname, 'test/javascript/mocks/turbo-rails.js'),
      '@rails/request.js': path.resolve(__dirname, 'test/javascript/mocks/requestjs.js'),
      '@replit/codemirror-vim': path.resolve(__dirname, 'test/javascript/mocks/codemirror-vim.js'),
    },
  },
})
