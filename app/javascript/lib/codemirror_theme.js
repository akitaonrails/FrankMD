// CodeMirror Theme Configuration
// Maps CSS variables from the theme system to CodeMirror's EditorView.theme()

import { EditorView } from "@codemirror/view"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags } from "@lezer/highlight"

/**
 * Create the CodeMirror editor theme with CSS variables
 * @param {Object} options - Theme options
 * @param {string} options.fontFamily - Font family for the editor
 * @param {string} options.fontSize - Font size in pixels
 * @param {string} options.lineHeight - Line height multiplier
 * @returns {Extension} - CodeMirror theme extension
 */
export function createEditorTheme(options = {}) {
  const {
    fontFamily = "'Cascadia Code', monospace",
    fontSize = "14px",
    lineHeight = "1.6"
  } = options

  return EditorView.theme({
    // Root editor styling
    "&": {
      height: "100%",
      fontSize: fontSize,
      backgroundColor: "var(--theme-bg-primary)",
      color: "var(--theme-text-primary)"
    },

    // Content area (scroller)
    ".cm-scroller": {
      fontFamily: fontFamily,
      lineHeight: lineHeight,
      overflow: "auto"
    },

    // Content container
    ".cm-content": {
      caretColor: "var(--theme-text-primary)",
      padding: "1rem 2rem"
    },

    // Active line highlighting
    ".cm-activeLine": {
      backgroundColor: "transparent"
    },

    // Line wrapping
    ".cm-line": {
      padding: "0"
    },

    // Cursor
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--theme-text-primary)",
      borderLeftWidth: "2px"
    },

    // Selection
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--theme-selection)"
    },

    // Gutters (line numbers)
    ".cm-gutters": {
      backgroundColor: "var(--theme-bg-secondary)",
      color: "var(--theme-text-faint)",
      border: "none",
      borderRight: "1px solid var(--theme-border)"
    },

    ".cm-gutter": {
      minWidth: "3ch"
    },

    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 0.5rem 0 0.5rem",
      minWidth: "3ch",
      textAlign: "right"
    },

    // Active line gutter
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--theme-text-muted)"
    },

    // Fold gutter
    ".cm-foldGutter": {
      width: "1rem"
    },

    // Placeholder text
    ".cm-placeholder": {
      color: "var(--theme-text-faint)",
      fontStyle: "italic"
    },

    // Search match highlighting
    ".cm-searchMatch": {
      backgroundColor: "var(--theme-selection)",
      outline: "1px solid var(--theme-accent)"
    },

    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--theme-accent)"
    },

    // Matching brackets
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--theme-selection)",
      outline: "1px solid var(--theme-accent)"
    },

    // Panels (search panel, etc.)
    ".cm-panels": {
      backgroundColor: "var(--theme-bg-secondary)",
      color: "var(--theme-text-primary)"
    },

    ".cm-panel": {
      padding: "0.5rem"
    },

    ".cm-panel input": {
      backgroundColor: "var(--theme-bg-primary)",
      color: "var(--theme-text-primary)",
      border: "1px solid var(--theme-border)",
      borderRadius: "0.25rem",
      padding: "0.25rem 0.5rem"
    },

    ".cm-panel button": {
      backgroundColor: "var(--theme-bg-hover)",
      color: "var(--theme-text-primary)",
      border: "1px solid var(--theme-border)",
      borderRadius: "0.25rem",
      padding: "0.25rem 0.5rem",
      cursor: "pointer"
    },

    ".cm-panel button:hover": {
      backgroundColor: "var(--theme-accent)",
      color: "var(--theme-accent-text)"
    },

    // Tooltip styling
    ".cm-tooltip": {
      backgroundColor: "var(--theme-bg-secondary)",
      border: "1px solid var(--theme-border)",
      borderRadius: "0.25rem"
    },

    ".cm-tooltip-autocomplete": {
      backgroundColor: "var(--theme-bg-secondary)"
    }
    // NOTE: vim's .cm-fat-cursor is styled in codemirror_extensions.js instead —
    // the library sets its colours at Prec.highest, which outranks this theme.
  }, { dark: true }) // Assume dark mode, CSS variables handle actual theme
}

/**
 * Create syntax highlighting style for markdown
 * Maps lezer/highlight tags to CSS variable colors
 * @returns {Extension} - Syntax highlighting extension
 */
export function createSyntaxHighlighting() {
  const highlightStyle = HighlightStyle.define([
    // Headings - use actual CSS variable values read at creation time
    // These will be re-created when theme changes
    { tag: tags.heading1, color: "var(--theme-heading-1)" },
    { tag: tags.heading2, color: "var(--theme-heading-2)" },
    { tag: tags.heading3, color: "var(--theme-heading-3)" },
    { tag: tags.heading4, color: "var(--theme-accent)" },
    { tag: tags.heading5, color: "var(--theme-accent)" },
    { tag: tags.heading6, color: "var(--theme-accent)" },

    // Emphasis - CodeMirror handles bold/italic natively without alignment issues
    { tag: tags.strong, fontWeight: "bold", color: "var(--theme-text-primary)" },
    { tag: tags.emphasis, fontStyle: "italic", color: "var(--theme-text-muted)" },
    { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--theme-text-muted)" },

    // Code
    {
      tag: tags.monospace,
      color: "var(--theme-accent)",
      backgroundColor: "var(--theme-code-bg)",
      borderRadius: "0.25rem",
      padding: "0 0.25rem"
    },

    // Links
    { tag: tags.link, color: "var(--theme-accent)", textDecoration: "underline" },
    { tag: tags.url, color: "var(--theme-accent)" },

    // Quote
    { tag: tags.quote, color: "var(--theme-text-muted)" },

    // Lists
    { tag: tags.list, color: "var(--theme-text-muted)" },

    // Meta (markdown syntax characters like #, *, etc.)
    { tag: tags.processingInstruction, color: "var(--theme-text-muted)" },
    { tag: tags.meta, color: "var(--theme-text-muted)" },

    // Content markers (like > for blockquotes, - for lists)
    { tag: tags.contentSeparator, color: "var(--theme-border)" },

    // HTML tags in markdown
    { tag: tags.angleBracket, color: "var(--theme-text-muted)" },
    { tag: tags.tagName, color: "var(--theme-accent)" },
    { tag: tags.attributeName, color: "var(--theme-heading-2)" },
    { tag: tags.attributeValue, color: "var(--theme-heading-3)" },

    // Comments (HTML comments in markdown)
    { tag: tags.comment, color: "var(--theme-text-faint)", fontStyle: "italic" },

    // Special markdown elements
    { tag: tags.labelName, color: "var(--theme-accent)" }, // Link labels
    { tag: tags.inserted, color: "var(--theme-accent)" }, // Insertions
    { tag: tags.deleted, color: "var(--theme-text-muted)", textDecoration: "line-through" },

    // Escape sequences
    { tag: tags.escape, color: "var(--theme-text-muted)" }
  ])

  return syntaxHighlighting(highlightStyle)
}

/**
 * Create a complete theme bundle with editor theme and syntax highlighting
 * @param {Object} options - Theme options
 * @returns {Extension[]} - Array of theme extensions
 */
export function createTheme(options = {}) {
  return [
    createEditorTheme(options),
    createSyntaxHighlighting()
  ]
}
