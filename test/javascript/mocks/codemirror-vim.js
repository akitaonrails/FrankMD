// Mock for @replit/codemirror-vim used in vitest.
// The real library needs a live CodeMirror EditorView + DOM; the unit tests only
// exercise our WIRING (compartment toggle, ex-command registration, mode-change
// plumbing), so we stub the surface our code touches and record interactions.

export const __vimMock = {
  exCommands: [],       // { name, prefix }
  maps: [],             // { lhs, rhs, mode }
  modeChangeHandlers: [],
  reset() {
    this.exCommands = []
    this.maps = []
    this.modeChangeHandlers = []
  }
}

// vim() returns a marker extension; our code only stores/compares it.
export function vim(options = {}) {
  return { __isVim: true, options }
}

export const Vim = {
  defineEx(name, prefix, fn) {
    __vimMock.exCommands.push({ name, prefix, fn })
  },
  map(lhs, rhs, mode) {
    __vimMock.maps.push({ lhs, rhs, mode })
  }
}

// getCM(view) returns a fake CM5-compat handle whose `on("vim-mode-change")`
// registers a handler the test can fire.
export function getCM() {
  return {
    on(event, handler) {
      if (event === "vim-mode-change") __vimMock.modeChangeHandlers.push(handler)
    }
  }
}

export const CodeMirror = {}
