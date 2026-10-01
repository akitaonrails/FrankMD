// Task list helpers (#203)
// Pure text transforms shared by the preview's click-to-toggle path (toggle a
// known task line) and the Ctrl+Enter editor shortcut (toggle or create).

// A GFM task item: bullet (-, *, +) or ordered number, then [ ] or [x]/[X],
// followed by whitespace or end of line
const TASK_ITEM = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)\[([ xX])\](\s|$)/

/**
 * Character range of the [ ]/[x] marker within a task line, plus its toggled
 * replacement. Replacing only this 3-char range keeps the marker
 * length-preserving, so every other cursor/selection position in the document
 * maps through the transaction unchanged.
 * @param {string} text - Source line text
 * @returns {{from: number, to: number, insert: string}|null} - Range or null
 */
export function taskMarkerRange(text) {
  const match = text.match(TASK_ITEM)
  if (!match) return null

  const from = match[1].length
  return {
    from,
    to: from + 3,
    insert: match[2] === " " ? "[x]" : "[ ]"
  }
}

/**
 * Toggle the [ ]/[x] marker of a task line
 * @param {string} text - Source line text
 * @returns {string|null} - Toggled line, or null when the line is not a task
 */
export function toggleTaskMarker(text) {
  const range = taskMarkerRange(text)
  if (!range) return null

  return text.slice(0, range.from) + range.insert + text.slice(range.to)
}

/**
 * Shortcut rule: toggle an existing task, otherwise turn the line into an
 * unchecked task (preserving leading indentation)
 * @param {string} text - Source line text
 * @returns {string} - Replacement line text
 */
export function applyTaskToggle(text) {
  const toggled = toggleTaskMarker(text)
  if (toggled !== null) return toggled

  const indent = text.match(/^\s*/)[0]
  const body = text.trim()
  return body ? `${indent}- [ ] ${body}` : `${indent}- [ ]`
}
