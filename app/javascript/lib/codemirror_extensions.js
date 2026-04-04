// CodeMirror Extensions Bundle
// Combines all necessary CodeMirror extensions for the markdown editor

import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLineGutter, drawSelection, rectangularSelection, highlightActiveLine, ViewPlugin } from "@codemirror/view"
import { EditorState, Compartment, Prec } from "@codemirror/state"
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { bracketMatching } from "@codemirror/language"
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search"
import { createTheme } from "lib/codemirror_theme"
import { LINE_NUMBER_MODES } from "lib/line_numbers"
import { createWikilinkAutocomplete } from "lib/codemirror_wikilink"

// Re-export for convenience
export { LINE_NUMBER_MODES }

// Compartments for dynamic reconfiguration
export const themeCompartment = new Compartment()
export const lineNumbersCompartment = new Compartment()
export const readOnlyCompartment = new Compartment()

/**
 * Create line numbers extension based on mode
 * @param {number} mode - Line number mode (OFF, ABSOLUTE, RELATIVE)
 * @returns {Extension} - Line numbers extension or empty array
 */
export function createLineNumbers(mode) {
  if (mode === LINE_NUMBER_MODES.OFF) {
    return []
  }

  if (mode === LINE_NUMBER_MODES.ABSOLUTE) {
    return [lineNumbers(), highlightActiveLineGutter()]
  }

  // Relative line numbers
  return [
    lineNumbers({
      formatNumber: (lineNo, state) => {
        // Get cursor line
        const cursorLine = state.doc.lineAt(state.selection.main.head).number

        if (lineNo === cursorLine) {
          return String(lineNo) // Show absolute number for current line
        }

        const distance = Math.abs(lineNo - cursorLine)
        return String(distance)
      }
    }),
    highlightActiveLineGutter()
  ]
}

/**
 * Custom keymap for markdown editing
 * Provides bold, italic, and other formatting shortcuts
 */
function wrapSelection(view, prefix, suffix) {
  const { from, to } = view.state.selection.main
  const selectedText = view.state.sliceDoc(from, to)

  // Check if already wrapped - toggle off
  const beforeFrom = Math.max(0, from - prefix.length)
  const afterTo = Math.min(view.state.doc.length, to + suffix.length)
  const textBefore = view.state.sliceDoc(beforeFrom, from)
  const textAfter = view.state.sliceDoc(to, afterTo)

  if (textBefore === prefix && textAfter === suffix) {
    // Unwrap
    view.dispatch({
      changes: [
        { from: beforeFrom, to: from, insert: "" },
        { from: to, to: afterTo, insert: "" }
      ],
      selection: { anchor: beforeFrom, head: beforeFrom + selectedText.length }
    })
    return true
  }

  // Check if selection itself contains the markers
  if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix) && selectedText.length >= prefix.length + suffix.length) {
    const unwrapped = selectedText.slice(prefix.length, -suffix.length || undefined)
    view.dispatch({
      changes: { from, to, insert: unwrapped },
      selection: { anchor: from, head: from + unwrapped.length }
    })
    return true
  }

  // Wrap selection
  const wrapped = prefix + selectedText + suffix
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: from + prefix.length, head: from + prefix.length + selectedText.length }
  })
  return true
}

// Markdown formatting keymap with highest priority to override browser defaults
const markdownKeymap = Prec.highest(keymap.of([
  // Bold: Ctrl/Cmd + B
  {
    key: "Mod-b",
    run: (view) => wrapSelection(view, "**", "**")
  },
  // Italic: Ctrl/Cmd + I
  {
    key: "Mod-i",
    run: (view) => wrapSelection(view, "*", "*")
  },
  // Strikethrough: Ctrl/Cmd + Shift + S
  {
    key: "Mod-Shift-s",
    run: (view) => wrapSelection(view, "~~", "~~")
  },
  // Inline code: Ctrl/Cmd + `
  {
    key: "Mod-`",
    run: (view) => wrapSelection(view, "`", "`")
  },
  // Link: Ctrl/Cmd + K
  {
    key: "Mod-k",
    run: (view) => {
      const { from, to } = view.state.selection.main
      const selectedText = view.state.sliceDoc(from, to)

      if (selectedText) {
        // Wrap selected text in link
        const linkText = `[${selectedText}](url)`
        view.dispatch({
          changes: { from, to, insert: linkText },
          // Select "url" for easy replacement
          selection: { anchor: from + selectedText.length + 3, head: from + selectedText.length + 6 }
        })
      } else {
        // Insert link template
        const linkText = "[](url)"
        view.dispatch({
          changes: { from, to, insert: linkText },
          selection: { anchor: from + 1 } // Place cursor inside []
        })
      }
      return true
    }
  }
]))

/**
 * Create the base extensions for the editor
 * @param {Object} options - Configuration options
 * @param {string} options.placeholderText - Placeholder text when editor is empty
 * @param {string} options.fontFamily - Font family
 * @param {string} options.fontSize - Font size
 * @param {string} options.lineHeight - Line height
 * @param {number} options.lineNumberMode - Line number display mode
 * @param {Function} options.onUpdate - Callback for document updates
 * @param {Function} options.onSelectionChange - Callback for selection changes
 * @param {Function} options.onScroll - Callback for scroll events
 * @returns {Extension[]} - Array of CodeMirror extensions
 */
export function createExtensions(options = {}) {
  const {
    placeholderText = "",
    fontFamily = "'Cascadia Code', monospace",
    fontSize = "14px",
    lineHeight = "1.6",
    lineNumberMode = LINE_NUMBER_MODES.OFF,
    onUpdate = null,
    onSelectionChange = null,
    onScroll = null
  } = options

  const extensions = [
    // Theme (in compartment for dynamic switching)
    themeCompartment.of(createTheme({ fontFamily, fontSize, lineHeight })),

    // Line numbers (in compartment for toggling)
    lineNumbersCompartment.of(createLineNumbers(lineNumberMode)),

    // Read-only state (in compartment for toggling)
    readOnlyCompartment.of(EditorState.readOnly.of(false)),

    // History (undo/redo)
    history(),

    // Markdown language support
    markdown({ base: markdownLanguage }),

    // Visual features
    drawSelection(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches({ minSelectionLength: 3, wholeWords: true }),
    bracketMatching(),

    // Line wrapping
    EditorView.lineWrapping,

    // Keymaps
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab
    ]),
    markdownKeymap,

    // Wikilink autocomplete ([[note name]])
    createWikilinkAutocomplete()
  ]

  // Placeholder
  if (placeholderText) {
    extensions.push(placeholder(placeholderText))
  }

  // Update listener for document changes
  if (onUpdate) {
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onUpdate(update)
      }
    }))
  }

  // Selection change listener
  if (onSelectionChange) {
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        onSelectionChange(update)
      }
    }))
  }

  // Scroll listener - use ViewPlugin to attach to scrollDOM since scroll events don't bubble
  if (onScroll) {
    extensions.push(ViewPlugin.fromClass(class {
      constructor(view) {
        this.view = view
        this.onScroll = (event) => onScroll(event, view)
        view.scrollDOM.addEventListener("scroll", this.onScroll)
      }
      destroy() {
        this.view.scrollDOM.removeEventListener("scroll", this.onScroll)
      }
    }))
  }

  return extensions
}

/**
 * Create extensions for a read-only editor (for previewing, etc.)
 * @param {Object} options - Configuration options
 * @returns {Extension[]} - Array of CodeMirror extensions
 */
export function createReadOnlyExtensions(options = {}) {
  return [
    ...createExtensions(options),
    EditorState.readOnly.of(true)
  ]
}
