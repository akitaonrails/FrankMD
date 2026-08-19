// Keyboard shortcuts utility - Declarative shortcut definitions and matching
// Extracted from app_controller.js for maintainability and future user customization

/**
 * Shortcut definitions with key, ctrl, shift, alt, meta modifiers
 * All shortcuts use ctrl on Windows/Linux and meta (Cmd) on macOS
 *
 * Each shortcut maps an action name to its key combination.
 * Set preventDefaultExceptions to false for actions that shouldn't prevent default.
 */
export const DEFAULT_SHORTCUTS = {
  newNote:        { key: "n", ctrl: true },
  save:           { key: "s", ctrl: true },
  // Note: bold (Ctrl+B) and italic (Ctrl+I) are handled by CodeMirror's keymap
  // in codemirror_extensions.js - do not add them here to avoid double execution
  togglePreview:  { key: "V", ctrl: true, shift: true },
  findInFile:     { key: "f", ctrl: true },
  findReplace:    { key: "h", ctrl: true },
  jumpToLine:     { key: "g", ctrl: true },
  lineNumbers:    { key: "l", ctrl: true },
  contentSearch:  { key: "F", ctrl: true, shift: true },
  fileFinder:     { key: "p", ctrl: true },
  toggleSidebar:  { key: "e", ctrl: true },
  typewriterMode: { key: "\\", ctrl: true },
  toggleScrollSync: { key: "\\", ctrl: true, shift: true },  // Ctrl+Shift+\ (toggle editor-preview scroll sync)
  textFormat:     { key: "m", ctrl: true },
  emojiPicker:    { key: "E", ctrl: true, shift: true },
  increaseWidth:  { key: "+", ctrl: true, shift: true },  // Ctrl+Shift++ (increase editor width)
  decreaseWidth:  { key: "_", ctrl: true, shift: true },  // Ctrl+Shift+- (decrease editor width)
  logViewer:      { key: "O", ctrl: true, shift: true },  // Ctrl+Shift+O (open log viewer)
  help:           { key: "F1" },
  closeDialogs:   { key: "Escape", preventDefault: false }
}

// Legacy export for backwards compatibility
export const SHORTCUTS = DEFAULT_SHORTCUTS

/**
 * Check if a keyboard event matches a shortcut definition
 * @param {KeyboardEvent} event - The keyboard event
 * @param {Object} shortcut - Shortcut definition with key and modifiers
 * @returns {boolean} - True if the event matches the shortcut
 */
export function matchShortcut(event, shortcut) {
  if (!shortcut || !shortcut.key) return false

  // Check key (case-sensitive for shifted keys like "V" vs "v")
  if (event.key !== shortcut.key) return false

  // Check ctrl/meta (supports both Windows/Linux ctrl and macOS cmd)
  const ctrlOrMeta = event.ctrlKey || event.metaKey
  if (shortcut.ctrl && !ctrlOrMeta) return false
  if (!shortcut.ctrl && ctrlOrMeta) return false

  // Check shift
  if (shortcut.shift && !event.shiftKey) return false
  if (!shortcut.shift && event.shiftKey) return false

  // Check alt
  if (shortcut.alt && !event.altKey) return false
  if (!shortcut.alt && event.altKey) return false

  return true
}

/**
 * Format a shortcut for display (e.g., "Ctrl+Shift+V")
 * @param {Object} shortcut - Shortcut definition
 * @param {boolean} useMac - Use Mac-style formatting (⌘ instead of Ctrl)
 * @returns {string} - Formatted shortcut string
 */
export function formatShortcut(shortcut, useMac = false) {
  if (!shortcut || !shortcut.key) return ""

  const parts = []

  if (shortcut.ctrl) {
    parts.push(useMac ? "⌘" : "Ctrl")
  }
  if (shortcut.shift) {
    parts.push(useMac ? "⇧" : "Shift")
  }
  if (shortcut.alt) {
    parts.push(useMac ? "⌥" : "Alt")
  }

  // Format special keys
  let keyDisplay = shortcut.key
  switch (shortcut.key) {
    case "\\":
      keyDisplay = "\\"
      break
    case "F1":
    case "F2":
    case "F3":
    case "F4":
    case "F5":
    case "F6":
    case "F7":
    case "F8":
    case "F9":
    case "F10":
    case "F11":
    case "F12":
      // Function keys stay as-is
      break
    default:
      // Uppercase single letters for display
      if (keyDisplay.length === 1) {
        keyDisplay = keyDisplay.toUpperCase()
      }
  }

  parts.push(keyDisplay)

  return useMac ? parts.join("") : parts.join("+")
}

/**
 * Detect if running on macOS
 * @returns {boolean}
 */
export function isMacOS() {
  if (typeof navigator === "undefined") return false
  // Use userAgentData if available (modern API), fall back to userAgent
  if (navigator.userAgentData) {
    return navigator.userAgentData.platform === "macOS"
  }
  return /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
}

/**
 * Find which action matches a keyboard event
 * @param {KeyboardEvent} event - The keyboard event
 * @param {Object} shortcuts - Shortcuts object mapping action names to definitions
 * @returns {string|null} - Action name if matched, null otherwise
 */
export function findMatchingAction(event, shortcuts) {
  for (const [action, shortcut] of Object.entries(shortcuts)) {
    if (matchShortcut(event, shortcut)) {
      return action
    }
  }
  return null
}

/**
 * Create a keydown event handler from shortcuts
 * @param {Object} shortcuts - Shortcuts object mapping action names to definitions
 * @param {Function} actionHandler - Called with (actionName, event) when a shortcut matches
 * @returns {Function} Event handler for keydown events
 */
export function createKeyHandler(shortcuts, actionHandler) {
  return (event) => {
    const action = findMatchingAction(event, shortcuts)

    if (action) {
      const shortcut = shortcuts[action]
      // preventDefault unless explicitly disabled for this shortcut
      if (shortcut.preventDefault !== false) {
        event.preventDefault()
      }
      actionHandler(action, event)
    }
  }
}

/**
 * Merge default shortcuts with user overrides
 * User shortcuts take precedence. Set a shortcut to null to disable it.
 * @param {Object} defaults - Default shortcuts
 * @param {Object} userShortcuts - User-defined overrides
 * @returns {Object} Merged shortcuts with null values filtered out
 */
export function mergeShortcuts(defaults, userShortcuts = {}) {
  const merged = { ...defaults }

  for (const [action, shortcut] of Object.entries(userShortcuts)) {
    if (shortcut === null) {
      // Remove the shortcut (allows disabling defaults)
      delete merged[action]
    } else {
      // Override with user shortcut
      merged[action] = shortcut
    }
  }

  return merged
}

/**
 * Get the shortcut definition for an action
 * @param {Object} shortcuts - Shortcuts object
 * @param {string} action - Action name
 * @returns {Object|null} Shortcut definition or null
 */
export function getShortcutForAction(shortcuts, action) {
  return shortcuts[action] || null
}
