// CodeMirror Typewriter Mode Extension
// Provides focused writing mode with cursor centered at 50% of viewport

import { EditorView, ViewPlugin } from "@codemirror/view"
import { StateField, StateEffect, Facet } from "@codemirror/state"

// State effect to toggle typewriter mode
export const setTypewriterMode = StateEffect.define()

// State effect to toggle "is selecting" state (mouse drag selection)
export const setIsSelecting = StateEffect.define()

// Facet to store typewriter mode state
export const typewriterMode = Facet.define({
  combine: values => values.length > 0 ? values[values.length - 1] : false
})

// State field to track typewriter mode
export const typewriterState = StateField.define({
  create() {
    return false
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setTypewriterMode)) {
        return effect.value
      }
    }
    return value
  },
  provide: f => typewriterMode.from(f)
})

// State field to track mouse selection state
export const isSelectingState = StateField.define({
  create() {
    return false
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setIsSelecting)) {
        return effect.value
      }
    }
    return value
  }
})

/**
 * Calculate the desired scroll position to center the cursor
 * @param {EditorView} view - The editor view
 * @returns {number|null} - Target scroll position or null if not needed
 */
function calculateTypewriterScroll(view) {
  try {
    const state = view.state
    const enabled = state.field(typewriterState)

    if (!enabled) return null

    // Get cursor position
    const cursorPos = state.selection.main.head

    // Get the coordinates of the cursor
    // Note: coordsAtPos may throw in JSDOM (test environment) due to missing getClientRects
    const coords = view.coordsAtPos(cursorPos)
    if (!coords) return null

    // Get the editor's visible area
    const editorRect = view.dom.getBoundingClientRect()
    const scrollDOM = view.scrollDOM

    // Calculate the cursor's position relative to the document
    const cursorY = coords.top - editorRect.top + scrollDOM.scrollTop

    // Calculate desired scroll position (cursor at 50% of viewport)
    const viewportCenter = scrollDOM.clientHeight / 2
    const targetScroll = cursorY - viewportCenter

    // Clamp to valid scroll range
    const maxScroll = scrollDOM.scrollHeight - scrollDOM.clientHeight
    return Math.max(0, Math.min(targetScroll, maxScroll))
  } catch {
    // In test environments (JSDOM), coordsAtPos may fail due to missing DOM APIs
    return null
  }
}

/**
 * Smoothly scroll to center the cursor
 * @param {EditorView} view - The editor view
 */
function maintainTypewriterScroll(view) {
  const targetScroll = calculateTypewriterScroll(view)
  if (targetScroll === null) return

  const scrollDOM = view.scrollDOM
  const currentScroll = scrollDOM.scrollTop

  // Only scroll if difference is significant
  if (Math.abs(currentScroll - targetScroll) > 5) {
    scrollDOM.scrollTop = targetScroll
  }
}

/**
 * Typewriter mode ViewPlugin
 * Handles scroll centering and adds padding for typewriter mode
 */
const typewriterPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view
    this.resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => this.refreshLayout())
    this.resizeObserver?.observe(view.dom)
    this.updatePadding()
  }

  update(update) {
    // Check if typewriter mode changed
    const wasEnabled = update.startState.field(typewriterState)
    const isEnabled = update.state.field(typewriterState)

    if (wasEnabled !== isEnabled) {
      this.updatePadding()
    }

    // Center cursor on selection changes or document changes
    // But NOT while:
    // 1. User is actively selecting with mouse (prevents scroll jitter during drag)
    // 2. There's an active text selection (anchor !== head) - user is selecting text
    const isMouseSelecting = update.state.field(isSelectingState)
    const selection = update.state.selection.main
    const hasTextSelection = selection.anchor !== selection.head

    if (isEnabled && !isMouseSelecting && !hasTextSelection && (update.selectionSet || update.docChanged)) {
      // Use setTimeout to ensure we run after CodeMirror's own scroll handling
      setTimeout(() => maintainTypewriterScroll(this.view), 0)
    }
  }

  updatePadding() {
    const enabled = this.view.state.field(typewriterState)
    const scroller = this.view.scrollDOM

    if (enabled) {
      // Add bottom padding equal to 50% of viewport height
      const padding = scroller.clientHeight / 2
      scroller.style.paddingBottom = `${padding}px`
      this.view.dom.classList.add("typewriter-mode")
    } else {
      scroller.style.paddingBottom = ""
      this.view.dom.classList.remove("typewriter-mode")
    }
  }

  refreshLayout() {
    if (!this.view.state.field(typewriterState)) return

    // The editor can be enabled while its workspace is hidden, when its
    // scroller has no height. Recalculate padding and scroll after it becomes
    // visible or changes size.
    this.updatePadding()

    const state = this.view.state
    const selection = state.selection.main
    const isMouseSelecting = state.field(isSelectingState)
    if (!isMouseSelecting && selection.anchor === selection.head) {
      maintainTypewriterScroll(this.view)
    }
  }

  destroy() {
    // Clean up padding
    this.resizeObserver?.disconnect()
    const scroller = this.view.scrollDOM
    scroller.style.paddingBottom = ""
    this.view.dom.classList.remove("typewriter-mode")
  }
})

/**
 * Refresh typewriter padding and cursor position after the editor becomes visible.
 * @param {EditorView} view - The editor view
 */
export function refreshTypewriterLayout(view) {
  view.plugin(typewriterPlugin)?.refreshLayout()
}

/**
 * Create typewriter mode extension
 * @param {boolean} enabled - Initial enabled state
 * @returns {Extension[]} - Array of extensions for typewriter mode
 */
export function createTypewriterExtension(enabled = false) {
  return [
    typewriterState.init(() => enabled),
    isSelectingState,
    typewriterPlugin,
    // CSS for typewriter mode
    EditorView.theme({
      "&.typewriter-mode .cm-content": {
        // Content styling in typewriter mode
      },
      "&.typewriter-mode .cm-cursor": {
        // Cursor styling - could add animation if desired
      }
    })
  ]
}

/**
 * Toggle typewriter mode
 * @param {EditorView} view - The editor view
 * @param {boolean} enabled - Enable or disable
 */
export function toggleTypewriter(view, enabled) {
  view.dispatch({
    effects: setTypewriterMode.of(enabled)
  })

  // Immediately center cursor if enabling
  if (enabled) {
    setTimeout(() => maintainTypewriterScroll(view), 0)
  }
}

/**
 * Check if typewriter mode is enabled
 * @param {EditorView} view - The editor view
 * @returns {boolean} - Whether typewriter mode is enabled
 */
export function isTypewriterEnabled(view) {
  return view.state.field(typewriterState)
}

/**
 * Get sync data for preview scroll coordination
 * @param {EditorView} view - The editor view
 * @returns {Object|null} - Sync data with currentLine and totalLines
 */
export function getTypewriterSyncData(view) {
  const state = view.state
  const cursorPos = state.selection.main.head
  const doc = state.doc

  const currentLine = doc.lineAt(cursorPos).number
  const totalLines = doc.lines

  return { currentLine, totalLines }
}
