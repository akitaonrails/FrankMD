// Vim mode for the editor (issue #80)
//
// Wraps @replit/codemirror-vim in a compartment so it can be toggled at runtime
// like the theme and line-number settings, without recreating the editor.

import { Compartment, Prec } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { vim, Vim } from "@replit/codemirror-vim"
import { isMacOS } from "lib/keyboard_shortcuts"

export const vimCompartment = new Compartment()

// Vim bindings that would swallow FrankMD/browser shortcuts on Windows and
// Linux, where the app binds Ctrl. macOS binds Cmd for app shortcuts, so there
// is no clash there and vim keeps its full keymap.
export const CONFLICTING_VIM_KEYS = [
  "<C-f>", // Ctrl+F  find in file   (DEFAULT_SHORTCUTS.findInFile)
  "<C-n>", // Ctrl+N  new note       (DEFAULT_SHORTCUTS.newNote)
  "<C-p>", // Ctrl+P  file finder    (DEFAULT_SHORTCUTS.fileFinder)
  "<C-e>", // Ctrl+E  toggle sidebar (DEFAULT_SHORTCUTS.toggleSidebar)
  "<C-b>", // Ctrl+B  bold           (markdown keymap)
  "<C-i>", // Ctrl+I  italic         (markdown keymap)
  "<C-v>"  // Ctrl+V  paste          (<C-q> still gives blockwise visual)
]

let keysConfigured = false

// Vim.unmap() splices entries out of the package's shared defaultKeymap array,
// so this is a module-level mutation: run it once per page load, not per editor.
export function configureVimKeys(keys = CONFLICTING_VIM_KEYS) {
  if (keysConfigured || isMacOS()) return false

  keys.forEach((key) => Vim.unmap(key))
  keysConfigured = true
  return true
}

// The package hardcodes a pink block cursor at Prec.highest; re-declare it after
// vim() (same bucket, later wins) so the current theme's colors are used.
const vimTheme = Prec.highest(EditorView.theme({
  ".cm-fat-cursor": {
    background: "var(--theme-accent)",
    color: "var(--theme-accent-text)"
  },
  "&:not(.cm-focused) .cm-fat-cursor": {
    background: "none",
    outline: "solid 1px var(--theme-accent)"
  },
  ".cm-vim-panel": {
    backgroundColor: "var(--theme-bg-secondary)",
    color: "var(--theme-text-primary)",
    fontFamily: "inherit"
  },
  ".cm-vim-panel input": {
    backgroundColor: "transparent",
    color: "var(--theme-text-primary)",
    fontFamily: "inherit"
  }
}))

// Extension value for the compartment: vim enabled, or nothing.
export function vimExtension(enabled) {
  if (!enabled) return []

  configureVimKeys()
  return [vim(), vimTheme]
}
