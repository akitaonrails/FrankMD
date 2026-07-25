import { Controller } from "@hotwired/stimulus"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import {
  createExtensions,
  themeCompartment,
  lineNumbersCompartment,
  readOnlyCompartment,
  vimCompartment,
  createVimExtension,
  createLineNumbers,
  LINE_NUMBER_MODES
} from "lib/codemirror_extensions"
import { registerVimCommands, observeVimMode } from "lib/vim_mode"
import { createTheme } from "lib/codemirror_theme"
import {
  createTypewriterExtension,
  toggleTypewriter,
  isTypewriterEnabled,
  getTypewriterSyncData,
  setIsSelecting
} from "lib/codemirror_typewriter"

// CodeMirror Controller
// Main Stimulus controller that manages the CodeMirror 6 editor
// Replaces the textarea-based syntax highlighting with native CodeMirror
// Exposes a textarea-compatible API for existing controllers

export default class extends Controller {
  static targets = ["container", "hidden"]

  static values = {
    content: { type: String, default: "" },
    placeholder: { type: String, default: "" },
    fontFamily: { type: String, default: "'Cascadia Code', monospace" },
    fontSize: { type: Number, default: 14 },
    lineHeight: { type: Number, default: 1.6 },
    lineNumberMode: { type: Number, default: 0 },
    typewriterMode: { type: Boolean, default: false },
    vimMode: { type: Boolean, default: false },
    readOnly: { type: Boolean, default: false }
  }

  connect() {
    this._isSelecting = false // Track mouse selection state
    this.createEditor()
  }

  disconnect() {
    if (this.editor) {
      this.editor.destroy()
      this.editor = null
    }
  }

  createEditor() {
    // Build extensions
    const extensions = createExtensions({
      placeholderText: this.placeholderValue,
      fontFamily: this.fontFamilyValue,
      fontSize: `${this.fontSizeValue}px`,
      lineHeight: String(this.lineHeightValue),
      lineNumberMode: this.lineNumberModeValue,
      vimMode: this.vimModeValue,
      onUpdate: (update) => this.onDocumentChange(update),
      onSelectionChange: (update) => this.onSelectionChange(update),
      onScroll: (event, view) => this.onScroll(event, view),
      onPaste: (file) => this.onImagePaste(file)
    })

    // Add typewriter extension
    extensions.push(...createTypewriterExtension(this.typewriterModeValue))

    // Create initial state
    const state = EditorState.create({
      doc: this.contentValue,
      extensions
    })

    // Create editor view
    this.editor = new EditorView({
      state,
      parent: this.containerTarget
    })

    // Apply max-width CSS custom property to content
    this.applyEditorWidth()

    // Sync initial content to hidden textarea for form submission
    this.syncToHidden()

    // Track mouse selection state to prevent scroll jitter during selection
    this.setupMouseTracking()

    // If vim mode is persisted on, wire up its commands + status now.
    if (this.vimModeValue) this.initVim()
  }

  setupMouseTracking() {
    if (!this.editor) return

    const scrollDOM = this.editor.scrollDOM

    // Track when user starts selecting with mouse
    scrollDOM.addEventListener("mousedown", (e) => {
      // Only track left button (button 0)
      if (e.button === 0) {
        this._isSelecting = true
        // Notify typewriter plugin to stop auto-scrolling during selection
        this.editor.dispatch({
          effects: setIsSelecting.of(true)
        })
      }
    })

    // Track when user finishes selecting
    document.addEventListener("mouseup", () => {
      if (this._isSelecting) {
        this._isSelecting = false
        // Notify typewriter plugin that selection is complete
        this.editor.dispatch({
          effects: setIsSelecting.of(false)
        })
        // Small delay before re-enabling scroll sync to let things settle
        setTimeout(() => {
          // Dispatch selection change now that selection is complete
          this.dispatch("selection-change", {
            detail: {
              selection: this.getSelection(),
              cursorInfo: this.getCursorInfo()
            }
          })
        }, 50)
      }
    })
  }

  // === Event Handlers ===

  onDocumentChange(update) {
    // Sync to hidden textarea for form submission
    this.syncToHidden()

    // Dispatch event for app controller
    this.dispatch("change", {
      detail: {
        content: this.getValue(),
        docChanged: true
      }
    })
  }

  onSelectionChange(update) {
    // Don't dispatch selection changes while user is actively selecting with mouse
    // We'll dispatch once when mouseup fires (see setupMouseTracking)
    if (this._isSelecting) return

    this.dispatch("selection-change", {
      detail: {
        selection: this.getSelection(),
        cursorInfo: this.getCursorInfo()
      }
    })
  }

  onScroll(event, view) {
    // Don't dispatch scroll events while user is selecting text
    // This prevents scroll jitter during mouse selection
    if (this._isSelecting) return

    this.dispatch("scroll", {
      detail: {
        scrollTop: view.scrollDOM.scrollTop,
        scrollHeight: view.scrollDOM.scrollHeight,
        clientHeight: view.scrollDOM.clientHeight,
        scrollRatio: this.getScrollRatio()
      }
    })
  }

  onImagePaste(file) {
    this.dispatch("image-pasted", { detail: { file } })
  }

  // === Public API (textarea-compatible) ===

  /**
   * Get the full document text
   * @returns {string}
   */
  getValue() {
    return this.editor?.state.doc.toString() || ""
  }

  /**
   * Set the document content
   * @param {string} text - New content
   */
  setValue(text) {
    if (!this.editor) return

    this.editor.dispatch({
      changes: {
        from: 0,
        to: this.editor.state.doc.length,
        insert: text
      }
    })
  }

  /**
   * Get current selection info
   * @returns {Object} - { from, to, text }
   */
  getSelection() {
    if (!this.editor) return { from: 0, to: 0, text: "" }

    const { from, to } = this.editor.state.selection.main
    const text = this.editor.state.sliceDoc(from, to)
    return { from, to, text }
  }

  /**
   * Set selection range
   * @param {number} from - Start position
   * @param {number} to - End position
   */
  setSelection(from, to) {
    if (!this.editor) return

    this.editor.dispatch({
      selection: { anchor: from, head: to }
    })
  }

  /**
   * Replace the current selection with text
   * @param {string} text - Replacement text
   */
  replaceSelection(text) {
    if (!this.editor) return

    const { from, to } = this.editor.state.selection.main
    this.editor.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length }
    })
  }

  /**
   * Insert text at a specific position
   * @param {number} pos - Position to insert at
   * @param {string} text - Text to insert
   */
  insertAt(pos, text) {
    if (!this.editor) return

    this.editor.dispatch({
      changes: { from: pos, to: pos, insert: text }
    })
  }

  /**
   * Replace text in a range
   * @param {string} text - Replacement text
   * @param {number} from - Start position
   * @param {number} to - End position
   */
  replaceRange(text, from, to) {
    if (!this.editor) return

    this.editor.dispatch({
      changes: { from, to, insert: text }
    })
  }

  /**
   * Focus the editor
   */
  focus() {
    this.editor?.focus()
  }

  /**
   * Check if editor has focus
   * @returns {boolean}
   */
  hasFocus() {
    return this.editor?.hasFocus || false
  }

  /**
   * Check if user is currently selecting text with mouse
   * @returns {boolean}
   */
  isSelecting() {
    return this._isSelecting || false
  }

  /**
   * Get scroll information
   * @returns {Object} - { top, left, height, clientHeight }
   */
  getScrollInfo() {
    if (!this.editor) return { top: 0, left: 0, height: 0, clientHeight: 0 }

    const scrollDOM = this.editor.scrollDOM
    return {
      top: scrollDOM.scrollTop,
      left: scrollDOM.scrollLeft,
      height: scrollDOM.scrollHeight,
      clientHeight: scrollDOM.clientHeight
    }
  }

  get isSelecting() { return this._isSelecting || false }

  /**
   * Set scroll position
   * @param {number} top - Scroll top position
   */
  scrollTo(top) {
    if (!this.editor) return
    this.editor.scrollDOM.scrollTop = top
  }

  /**
   * Get scroll ratio (0-1)
   * @returns {number}
   */
  getScrollRatio() {
    if (!this.editor) return 0

    const scrollDOM = this.editor.scrollDOM
    const maxScroll = scrollDOM.scrollHeight - scrollDOM.clientHeight
    if (maxScroll <= 0) return 0

    return scrollDOM.scrollTop / maxScroll
  }

  /**
   * Get cursor position information
   * @returns {Object} - { line, column, offset }
   */
  getCursorPosition() {
    if (!this.editor) return { line: 1, column: 1, offset: 0 }

    const pos = this.editor.state.selection.main.head
    const line = this.editor.state.doc.lineAt(pos)

    return {
      line: line.number,
      column: pos - line.from + 1,
      offset: pos
    }
  }

  /**
   * Set cursor position
   * @param {number} line - Line number (1-based)
   * @param {number} column - Column number (1-based)
   */
  setCursorPosition(line, column = 1) {
    if (!this.editor) return

    const doc = this.editor.state.doc
    const targetLine = Math.max(1, Math.min(line, doc.lines))
    const lineInfo = doc.line(targetLine)
    const targetColumn = Math.max(1, Math.min(column, lineInfo.length + 1))
    const pos = lineInfo.from + targetColumn - 1

    this.editor.dispatch({
      selection: { anchor: pos }
    })

    // Scroll to make cursor visible
    this.editor.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: "center" })
    })
  }

  /**
   * Get total line count
   * @returns {number}
   */
  getLineCount() {
    return this.editor?.state.doc.lines || 0
  }

  /**
   * Get content of a specific line
   * @param {number} n - Line number (1-based)
   * @returns {string}
   */
  getLine(n) {
    if (!this.editor) return ""

    const doc = this.editor.state.doc
    if (n < 1 || n > doc.lines) return ""

    return doc.line(n).text
  }

  /**
   * Get cursor info for stats panel
   * @returns {Object} - { currentLine, totalLines }
   */
  getCursorInfo() {
    if (!this.editor) return { currentLine: 1, totalLines: 1 }

    const pos = this.editor.state.selection.main.head
    const doc = this.editor.state.doc

    return {
      currentLine: doc.lineAt(pos).number,
      totalLines: doc.lines
    }
  }

  // === Theme and Font Configuration ===

  /**
   * Set font family
   * @param {string} family - CSS font-family value
   */
  setFontFamily(family) {
    this.fontFamilyValue = family
    this.reconfigureTheme()
  }

  /**
   * Set font size
   * @param {number} size - Font size in pixels
   */
  setFontSize(size) {
    this.fontSizeValue = size
    this.reconfigureTheme()
  }

  /**
   * Set line height
   * @param {number} height - Line height multiplier
   */
  setLineHeight(height) {
    this.lineHeightValue = height
    this.reconfigureTheme()
  }

  /**
   * Reconfigure theme with current settings
   */
  reconfigureTheme() {
    if (!this.editor) return

    const newTheme = createTheme({
      fontFamily: this.fontFamilyValue,
      fontSize: `${this.fontSizeValue}px`,
      lineHeight: String(this.lineHeightValue)
    })

    this.editor.dispatch({
      effects: themeCompartment.reconfigure(newTheme)
    })
  }

  // === Line Numbers ===

  /**
   * Set line number mode
   * @param {number} mode - LINE_NUMBER_MODES value (OFF, ABSOLUTE, RELATIVE)
   */
  setLineNumberMode(mode) {
    if (!this.editor) return

    this.lineNumberModeValue = mode
    this.editor.dispatch({
      effects: lineNumbersCompartment.reconfigure(createLineNumbers(mode, this.editor))
    })
  }

  // === Vim Mode ===

  /**
   * Enable or disable vim mode live. Reconfigures the vim compartment; when
   * enabling for the first time, registers the ex-commands and starts observing
   * the vim sub-mode so the app can show a status indicator.
   * @param {boolean} enabled
   */
  setVimMode(enabled) {
    if (!this.editor) return
    this.vimModeValue = enabled

    this.editor.dispatch({
      effects: vimCompartment.reconfigure(createVimExtension(enabled))
    })

    if (enabled) {
      this.initVim()
    } else {
      // Announce that vim is off so the status indicator can hide.
      this.dispatch("vim-mode", { detail: { enabled: false, mode: null } })
    }
  }

  /**
   * One-time-per-editor vim setup: register the FrankMD ex-commands and observe
   * sub-mode changes. Safe to call again on re-enable (guards re-registration).
   */
  initVim() {
    if (!this._vimObserver) {
      registerVimCommands({
        // Ex-commands dispatch a Stimulus event the app controller maps to a
        // FrankMD feature (save, close, finder, sidebar, next/prev, help).
        onCommand: (command, args) => this.dispatch("vim-command", { detail: { command, args } })
      })
      this._vimObserver = observeVimMode(this.editor, {
        onModeChange: (mode) => this.dispatch("vim-mode", { detail: { enabled: true, mode } })
      })
    }
    // Emit the current mode immediately so the indicator shows on enable.
    this.dispatch("vim-mode", { detail: { enabled: true, mode: "normal" } })
  }

  /**
   * Toggle line number mode (OFF -> ABSOLUTE -> RELATIVE -> OFF)
   * @returns {number} - New mode value
   */
  toggleLineNumberMode() {
    const modes = [LINE_NUMBER_MODES.OFF, LINE_NUMBER_MODES.ABSOLUTE, LINE_NUMBER_MODES.RELATIVE]
    const currentIndex = modes.indexOf(this.lineNumberModeValue)
    const newIndex = (currentIndex + 1) % modes.length
    const newMode = modes[newIndex]

    this.setLineNumberMode(newMode)
    return newMode
  }

  // === Typewriter Mode ===

  /**
   * Set typewriter mode
   * @param {boolean} enabled - Enable or disable
   */
  setTypewriterMode(enabled) {
    if (!this.editor) return

    this.typewriterModeValue = enabled
    toggleTypewriter(this.editor, enabled)
  }

  /**
   * Toggle typewriter mode
   * @returns {boolean} - New state
   */
  toggleTypewriterMode() {
    const newState = !this.typewriterModeValue
    this.setTypewriterMode(newState)
    return newState
  }

  /**
   * Check if typewriter mode is enabled
   * @returns {boolean}
   */
  isTypewriterMode() {
    if (!this.editor) return false
    return isTypewriterEnabled(this.editor)
  }

  /**
   * Get typewriter sync data for preview coordination
   * @returns {Object|null}
   */
  getTypewriterSyncData() {
    if (!this.editor) return null
    return getTypewriterSyncData(this.editor)
  }

  /**
   * Maintain typewriter scroll position (center cursor)
   */
  maintainTypewriterScroll() {
    if (this.typewriterModeValue) {
      // The typewriter plugin handles this automatically on selection changes
      // But we can force a recenter by dispatching a no-op selection change
      const pos = this.editor.state.selection.main.head
      this.editor.dispatch({
        selection: { anchor: pos }
      })
    }
  }

  // === Read-only Mode ===

  /**
   * Set read-only state
   * @param {boolean} readOnly - Enable or disable read-only
   */
  setReadOnly(readOnly) {
    if (!this.editor) return

    this.readOnlyValue = readOnly
    this.editor.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly))
    })
  }

  // === Editor Width ===

  /**
   * Apply editor width CSS custom property
   */
  applyEditorWidth() {
    // The editor width is controlled via CSS custom property
    // This is set on document.documentElement by app_controller
    // The .cm-content selector picks it up via max-width
  }

  // === Hidden Textarea Sync ===

  /**
   * Sync content to hidden textarea for form submission
   */
  syncToHidden() {
    if (this.hasHiddenTarget) {
      this.hiddenTarget.value = this.getValue()
    }
  }

  // === Stimulus Value Callbacks ===

  contentValueChanged() {
    // Only update if editor exists and content differs
    if (this.editor && this.getValue() !== this.contentValue) {
      this.setValue(this.contentValue)
    }
  }

  placeholderValueChanged() {
    // Placeholder changes require recreation - not commonly needed
  }

  readOnlyValueChanged() {
    this.setReadOnly(this.readOnlyValue)
  }

  // === Utility Methods ===

  /**
   * Get the EditorView instance (for advanced usage)
   * @returns {EditorView|null}
   */
  getEditorView() {
    return this.editor
  }

  /**
   * Get position for a specific line number
   * @param {number} lineNumber - Line number (1-based)
   * @returns {number} - Character position
   */
  getPositionForLine(lineNumber) {
    if (!this.editor) return 0

    const doc = this.editor.state.doc
    const targetLine = Math.max(1, Math.min(lineNumber, doc.lines))
    return doc.line(targetLine).from
  }

  /**
   * Scroll to make a position visible
   * @param {number} pos - Character position
   */
  scrollToPosition(pos) {
    if (!this.editor) return

    this.editor.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: "center" })
    })
  }

  /**
   * Jump to a specific line and optionally center it
   * @param {number} lineNumber - Line number (1-based)
   */
  jumpToLine(lineNumber) {
    if (!this.editor) return

    const pos = this.getPositionForLine(lineNumber)
    this.editor.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" })
    })
    this.focus()
  }

  /**
   * Execute a CodeMirror command by name
   * @param {Function} command - Command function
   */
  executeCommand(command) {
    if (!this.editor) return false
    return command(this.editor)
  }

  /**
   * Dispatch input event for compatibility with existing listeners
   */
  triggerInput() {
    this.dispatch("change", {
      detail: {
        content: this.getValue(),
        docChanged: true
      }
    })
  }
}
