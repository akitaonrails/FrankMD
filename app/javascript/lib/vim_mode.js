// FrankMD vim-mode glue for @replit/codemirror-vim.
//
// Two responsibilities, both kept out of the Stimulus controller so they can be
// unit-tested in isolation:
//   1. registerVimCommands() — define the FrankMD `:` ex-commands. Each one just
//      reports a logical command name back to the caller, which maps it to an
//      app feature (save, close, finder, sidebar, next/prev, help). The vim
//      library owns all native motions/edits/search; we only add the ex-commands
//      that reach into FrankMD.
//   2. observeVimMode() — subscribe to the library's mode-change events so the
//      app can show "-- NORMAL/INSERT/VISUAL --".
//
// Both take the library via import; the vitest mock stands in for it in tests.

import { Vim, getCM } from "@replit/codemirror-vim"
import { isMacOS } from "lib/keyboard_shortcuts"

// Ex-command definitions: [fullName, prefix, logicalCommand].
// prefix is the shortest accepted abbreviation (vim convention), e.g. :w for :write.
// :noh / :nohlsearch is intentionally omitted — the vim library implements it
// natively; overriding it would break the standard search-highlight clearing.
export const EX_COMMANDS = [
  [ "write", "w", "save" ],
  [ "quit", "q", "close" ],
  [ "wq", "wq", "save-and-close" ],
  [ "xit", "x", "save-and-close" ],
  [ "help", "help", "help" ],
  [ "edit", "e", "finder" ],
  [ "find", "find", "finder" ],
  [ "Explore", "Explore", "toggle-sidebar" ],
  [ "next", "n", "next-note" ],
  [ "prev", "prev", "prev-note" ]
]

/**
 * Index of the note to move to for :n / :prev. Wraps around, and when nothing
 * is selected starts at the first note (forward) or last note (backward).
 * @param {number} count - number of notes
 * @param {number} currentIndex - index of the selected note, or -1 if none
 * @param {number} direction - +1 (next) or -1 (previous)
 * @returns {number} target index, or -1 when there are no notes
 */
export function nextNoteIndex(count, currentIndex, direction) {
  if (count <= 0) return -1
  if (currentIndex === -1) return direction > 0 ? 0 : count - 1
  return (currentIndex + direction + count) % count
}

// Vim claims these Ctrl bindings in normal/visual mode and swallows them
// (preventDefault + stopPropagation), which on Windows/Linux takes them away
// from FrankMD and the browser. macOS binds Cmd for app shortcuts, so vim keeps
// its full keymap there.
// <C-d>/<C-u> paging is untouched, and <C-q> still gives blockwise visual in
// place of <C-v> — the standard vim-on-Windows convention.
export const APP_OWNED_KEYS = [
  "<C-f>", // find in file      (DEFAULT_SHORTCUTS.findInFile)
  "<C-n>", // new note          (DEFAULT_SHORTCUTS.newNote)
  "<C-p>", // file finder       (DEFAULT_SHORTCUTS.fileFinder)
  "<C-e>", // toggle sidebar    (DEFAULT_SHORTCUTS.toggleSidebar)
  "<C-b>", // bold              (markdown keymap)
  "<C-i>", // italic            (markdown keymap)
  "<C-v>"  // paste             (browser)
]

let keysConfigured = false

/**
 * Hand the bindings FrankMD already owns back to the app. Vim.unmap() splices
 * entries out of the library's shared defaultKeymap, so this is a module-level
 * mutation: it runs once per page load, not per editor.
 * @returns {boolean} whether the keys were unmapped
 */
export function configureVimKeys(keys = APP_OWNED_KEYS) {
  if (keysConfigured || isMacOS()) return false

  keys.forEach((key) => Vim.unmap(key))
  keysConfigured = true
  return true
}

// Test-only: reset the one-shot guard.
export function _resetVimKeys() {
  keysConfigured = false
}

let registered = false

/**
 * Define the FrankMD ex-commands once. `onCommand(logicalName, args)` is invoked
 * when the user runs one (e.g. `:w`). Idempotent — safe to call on every enable.
 * @param {{ onCommand: (command: string, args: object) => void }} opts
 */
export function registerVimCommands({ onCommand }) {
  if (registered) return
  registered = true

  for (const [ name, prefix, command ] of EX_COMMANDS) {
    Vim.defineEx(name, prefix, (_cm, params) => {
      onCommand(command, { args: params?.args || [] })
    })
  }
}

// Test-only: reset the one-shot registration guard.
export function _resetVimCommands() {
  registered = false
}

/**
 * Observe vim sub-mode changes. Calls onModeChange("normal"|"insert"|"visual"|...)
 * whenever the mode changes. Returns a handle (currently just a marker).
 * @param {EditorView} view
 * @param {{ onModeChange: (mode: string) => void }} opts
 */
export function observeVimMode(view, { onModeChange }) {
  const cm = getCM(view)
  if (!cm) return null

  cm.on("vim-mode-change", (event) => {
    // event.mode is "normal" | "insert" | "visual"; subMode refines visual.
    const mode = event?.subMode ? `${event.mode}-${event.subMode}` : event?.mode
    if (mode) onModeChange(mode)
  })

  return { cm }
}
